// Stripe webhook. VERIFIES the Stripe-Signature against STRIPE_WEBHOOK_SECRET
// before trusting any payload (unverified → 400, never processed). Syncs
// subscription state onto organisations. Env-gated: 501 when unconfigured.
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getStripe, STRIPE_WEBHOOK_SECRET, planForPriceId } from '@/lib/stripe'

// Stripe needs the raw, unparsed body to verify the signature.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Maps a Stripe subscription to our organisations columns and writes them,
// keyed by stripe_customer_id (resolved from the credential-signed event,
// never client input).
async function syncSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const priceId = sub.items.data[0]?.price?.id ?? null
  const plan = planForPriceId(priceId)

  // active/trialing → paid; past_due/unpaid → failed; canceled → free.
  let billingStatus: 'paid' | 'failed' | 'overdue' = 'paid'
  if (sub.status === 'past_due' || sub.status === 'unpaid') billingStatus = 'failed'
  else if (sub.status === 'incomplete' || sub.status === 'incomplete_expired') billingStatus = 'overdue'

  const canceled = sub.status === 'canceled'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {
    stripe_subscription_id: canceled ? null : sub.id,
    billing_status: canceled ? 'paid' : billingStatus,
    renews_at: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
  }
  // Only move the plan when we can map the price (or on cancel → free). An
  // unmapped price leaves the existing plan (e.g. manual enterprise) untouched.
  if (canceled) update.plan = 'free'
  else if (plan) update.plan = plan

  const { error } = await admin()
    .from('organisations')
    .update(update)
    .eq('stripe_customer_id', customerId)
  if (error) console.error('[stripe-webhook] org update failed', error.message)
}

export async function POST(req: Request) {
  const stripe = getStripe()
  const secret = STRIPE_WEBHOOK_SECRET()
  if (!stripe || !secret) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 501 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err) {
    // Signature verification failed — reject, do not trust the payload.
    console.error('[stripe-webhook] signature verification failed', (err as Error).message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription)
        break
      case 'checkout.session.completed': {
        // Fetch the subscription the checkout created and sync it.
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
          const sub = await stripe.subscriptions.retrieve(subId)
          await syncSubscription(sub)
        }
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
        if (customerId) {
          await admin().from('organisations').update({ billing_status: 'failed' }).eq('stripe_customer_id', customerId)
        }
        break
      }
      default:
        break
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error', (err as Error).message)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
