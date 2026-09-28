// Shared lookups for the public QR requisition portal.
//
// Every route here is UNAUTHENTICATED by design (the middleware matcher covers
// /dashboard and /platform only), so each one re-derives everything it trusts
// from two secrets the caller must hold: the site's QR token, and a verified
// portal session. Nothing is taken from the request body except the values that
// are validated against those two.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SESSION_TTL_MIN } from '@/lib/requisitionPortal'

export const runtime = 'nodejs'

export function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type PortalSite = {
  id: string
  name: string | null
  organisation_id: string
  domains: string[]
  orgName: string | null
}

/** Resolves a QR token to its site + the org's email allowlist, or null. */
export async function siteByToken(admin: SupabaseClient, token: string): Promise<PortalSite | null> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null
  const { data } = await admin
    .from('sites')
    .select('id, name, organisation_id, organisation:organisation_id(name, requisition_email_domains)')
    .eq('requisition_token', token)
    .maybeSingle()
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const org = data.organisation as any
  return {
    id: data.id as string,
    name: (data.name as string) ?? null,
    organisation_id: data.organisation_id as string,
    domains: (org?.requisition_email_domains ?? []) as string[],
    orgName: org?.name ?? null,
  }
}

export type PortalSession = {
  id: string
  email: string
  site_id: string
  organisation_id: string
}

/**
 * A session is usable only if it was verified, has not aged out, and still
 * belongs to the site whose QR the caller is holding — so a session opened for
 * one site cannot be replayed against another.
 */
export async function verifiedSession(
  admin: SupabaseClient,
  sessionId: string,
  siteId: string
): Promise<PortalSession | null> {
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) return null
  const { data } = await admin
    .from('requisition_portal_sessions')
    .select('id, email, site_id, organisation_id, verified_at')
    .eq('id', sessionId)
    .eq('site_id', siteId)
    .maybeSingle()
  if (!data?.verified_at) return null
  const age = Date.now() - new Date(data.verified_at as string).getTime()
  if (age > SESSION_TTL_MIN * 60_000) return null
  return {
    id: data.id as string,
    email: data.email as string,
    site_id: data.site_id as string,
    organisation_id: data.organisation_id as string,
  }
}
