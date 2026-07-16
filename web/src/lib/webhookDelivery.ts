// MKT-19 — outbound webhook delivery.
//
// deliverWebhookEvent() finds every active webhook registered for an org+event
// (webhooks table from b3-01-public-api.sql) and POSTs the JSON payload to each,
// signed with HMAC-SHA256 over the raw body using that webhook's stored secret.
// The signature rides in `X-Serviq-Signature: sha256=<hex>` so the receiver can
// verify authenticity.
//
// Delivery is BEST-EFFORT and fire-and-forget: callers do `void deliverWebhookEvent(...)`
// so a slow/broken receiver never blocks or fails the originating request. Each POST
// has a short timeout; failures are logged, not retried inline (a single lazy retry
// is done per endpoint — enough for a transient blip without a queue).
//
// ponytail: no delivery-log table, no exponential backoff queue. One retry, 5s timeout.
// Add a durable outbox table + worker if delivery SLAs ever demand it.

import { createHmac } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type WebhookEvent = 'wo.created' | 'wo.status_changed' | 'request.submitted'

type WebhookRow = { id: string; url: string; secret: string }

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

async function postOnce(url: string, body: string, signature: string, event: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Serviq-Signature': signature,
        'X-Serviq-Event': event,
      },
      body,
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// Fires `event` to every active webhook for `orgId`. Never throws — safe to `void`.
export async function deliverWebhookEvent(
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = serviceClient()
    if (!admin) return

    const { data: hooks, error } = await admin
      .from('webhooks')
      .select('id, url, secret')
      .eq('organisation_id', orgId)
      .eq('event', event)
      .eq('is_active', true)
      .returns<WebhookRow[]>()

    if (error || !hooks?.length) return

    const body = JSON.stringify({ event, created_at: new Date().toISOString(), data })

    await Promise.all(
      hooks.map(async (hook) => {
        const sig = sign(hook.secret, body)
        // one best-effort retry on failure — covers a transient blip without a queue.
        const ok = (await postOnce(hook.url, body, sig, event)) || (await postOnce(hook.url, body, sig, event))
        if (ok) {
          void admin.from('webhooks').update({ last_delivery_at: new Date().toISOString() }).eq('id', hook.id).then(undefined, () => {})
        } else {
          console.error('[webhookDelivery] delivery failed', { event, hookId: hook.id })
        }
      }),
    )
  } catch (e) {
    console.error('[webhookDelivery] unexpected error', e)
  }
}
