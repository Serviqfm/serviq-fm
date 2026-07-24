import { NextResponse } from 'next/server'
import { getOrgId, getScopedSupabaseClient } from '@/lib/auth-helper'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// AP-07 — active announcements for the caller's own org (or broadcast to all).
// Org is resolved from the session (never the request); honours impersonation.
export async function GET() {
  const { orgId, impersonating } = await getOrgId()
  if (!orgId) return NextResponse.json({ announcements: [] })

  const supabase = getScopedSupabaseClient(impersonating)
  // Filter explicitly so this is correct whether the client is RLS-bound (normal
  // tenant) or the service-role client (impersonation, which bypasses RLS).
  const { data } = await supabase
    .from('tenant_announcements')
    .select('id, title, body, published_at')
    .eq('active', true)
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString())
    .or(`organisation_id.is.null,organisation_id.eq.${orgId}`)
    .order('published_at', { ascending: false })

  return NextResponse.json({ announcements: data ?? [] })
}
