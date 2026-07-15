// /api/developers/webhooks — admin-only webhook endpoint registration.
//   GET    list endpoints (secret shown so the admin can configure their receiver)
//   POST   register an endpoint — generates the HMAC signing secret server-side
//   DELETE ?id=  remove an endpoint
// Delivery (signed POST on events) is a follow-up stub; this ships registration + secret.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdmin, generateWebhookSecret, VALID_EVENTS } from '../_helpers'

export const dynamic = 'force-dynamic'

// SSRF guard: block private / loopback / link-local / cloud-metadata hosts so a
// registered webhook can't aim the server's outbound POST at the internal network.
function isBlockedHost(h: string): boolean {
  const host = h.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1') return true
  if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.')) return true
  if (host === '169.254.169.254' || host.startsWith('169.254.')) return true
  const m = host.match(/^172\.(\d+)\./)
  if (m && +m[1] >= 16 && +m[1] <= 31) return true
  if (host.startsWith('fd') || host.startsWith('fe80')) return true
  return false
}

export async function GET() {
  const ctx = await resolveAdmin()
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.admin
    .from('webhooks')
    .select('id, url, event, secret, is_active, last_delivery_at, created_at')
    .eq('organisation_id', ctx.orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[developers/webhooks GET] failed', error)
    return NextResponse.json({ error: 'Failed to load webhooks' }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveAdmin()
  if (ctx instanceof NextResponse) return ctx

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const event = typeof body.event === 'string' ? body.event : ''

  // Require a valid absolute https URL (no plaintext http, no relative).
  let parsed: URL | null = null
  try { parsed = new URL(url) } catch { parsed = null }
  if (!parsed || parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'A valid https URL is required' }, { status: 400 })
  }
  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: 'Webhook URL must be a public host' }, { status: 400 })
  }
  if (!VALID_EVENTS.includes(event as never)) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
  }

  const { data, error } = await ctx.admin
    .from('webhooks')
    .insert({
      organisation_id: ctx.orgId,
      url,
      event,
      secret: generateWebhookSecret(),
      created_by: ctx.userId,
    })
    .select('id, url, event, secret, is_active, created_at')
    .single()

  if (error) {
    console.error('[developers/webhooks POST] failed', error)
    return NextResponse.json({ error: 'Failed to register webhook' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const ctx = await resolveAdmin()
  if (ctx instanceof NextResponse) return ctx

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await ctx.admin
    .from('webhooks')
    .delete()
    .eq('id', id)
    .eq('organisation_id', ctx.orgId)

  if (error) {
    console.error('[developers/webhooks DELETE] failed', error)
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
