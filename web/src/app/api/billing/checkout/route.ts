// Admin-only. Creates a Stripe Checkout session (for a new subscription) or a
// Billing Portal session (to manage an existing one). Org is resolved from the
// authenticated session — never from the request body. Env-gated: returns 501
// when Stripe is not configured.
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getStripe, PLAN_PRICE_ENV } from '@/lib/stripe'
import { getAppUrl } from '@/lib/app-url'

export async function POST(req: Request) {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 501 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id, role, email')
    .eq('id', user.id)
    .single()
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({} as { plan?: string }))
  const plan = typeof body.plan === 'string' ? body.plan : 'starter'
  const priceId = PLAN_PRICE_ENV[plan]

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: org } = await admin
    .from('organisations')
    .select('id, name, stripe_customer_id, stripe_subscription_id')
    .eq('id', profile.organisation_id)
    .single()
  if (!org) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })

  // Ensure a Stripe customer exists for this org, persisted so the webhook can
  // map events back to the org.
  let customerId = org.stripe_customer_id as string | null
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name ?? undefined,
      email: profile.email ?? undefined,
      metadata: { organisation_id: org.id },
    })
    customerId = customer.id
    await admin.from('organisations').update({ stripe_customer_id: customerId }).eq('id', org.id)
  }

  const returnUrl = `${getAppUrl()}/dashboard/billing`

  // Already subscribed → send them to the Billing Portal to manage/cancel.
  if (org.stripe_subscription_id) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    })
    return NextResponse.json({ url: portal.url })
  }

  if (!priceId) {
    return NextResponse.json({ error: `Plan "${plan}" is not purchasable` }, { status: 400 })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${returnUrl}?status=success`,
    cancel_url: `${returnUrl}?status=cancelled`,
    // Bind the org so the webhook can resolve it even before the customer row syncs.
    subscription_data: { metadata: { organisation_id: org.id } },
    metadata: { organisation_id: org.id },
  })

  return NextResponse.json({ url: session.url })
}
