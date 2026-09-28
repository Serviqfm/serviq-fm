// Admin-only configuration for the QR requisition portal.
//
//   PATCH { domains: string[] } — the official-email allowlist for the org.
//   POST  { site_id }           — rotate one site's QR token (the old code dies).
//
// Admin only, not manager: the allowlist is what decides who outside the system
// may commit the organisation's money, and a rotated token silently breaks every
// printed sign. Both are service-role writes because organisations and the token
// column are not meant to be PATCHed straight through PostgREST.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'
import { normalizeDomain } from '@/lib/requisitionPortal'

export const dynamic = 'force-dynamic'

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

export async function PATCH(req: NextRequest) {
  const caller = await resolveCaller(['admin'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (!Array.isArray(body.domains)) {
    return NextResponse.json({ error: 'domains must be a list' }, { status: 400 })
  }

  const domains = Array.from(new Set(
    (body.domains as unknown[])
      .filter((d): d is string => typeof d === 'string')
      .map(normalizeDomain)
      .filter(Boolean)
  ))
  if (domains.length > 20) {
    return NextResponse.json({ error: 'At most 20 domains' }, { status: 400 })
  }
  const bad = domains.find(d => !DOMAIN_RE.test(d))
  if (bad) {
    return NextResponse.json({ error: `Not a valid domain: ${bad}` }, { status: 400 })
  }

  const { error } = await admin
    .from('organisations')
    .update({ requisition_email_domains: domains })
    .eq('id', orgId)
  if (error) {
    console.error('[procurement portal] domain update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ domains })
}

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(['admin'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const siteId = typeof body.site_id === 'string' ? body.site_id : ''
  if (!siteId) return NextResponse.json({ error: 'site_id is required' }, { status: 400 })

  const { data: site, error } = await admin
    .from('sites')
    .update({ requisition_token: crypto.randomUUID() })
    .eq('id', siteId)
    .eq('organisation_id', orgId)
    .select('id, requisition_token')
    .maybeSingle()
  if (error) {
    console.error('[procurement portal] token rotate failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!site) return NextResponse.json({ error: 'Site not found in your organisation' }, { status: 404 })

  return NextResponse.json({ site })
}
