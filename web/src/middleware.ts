// web/src/middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export const config = {
  matcher: ['/platform/:path*', '/dashboard/:path*'],
}

// Inlined here (instead of imported from lib/impersonation) so middleware stays Edge-compatible —
// lib/impersonation uses Node's `crypto` builtin which is not available in the Edge runtime that
// Next 14 uses for middleware on Vercel, even with runtime='nodejs' (only respected in Next 15+).
const IMPERSONATION_COOKIE_NAME = 'impersonating_org_id'
const IMPERSONATION_TTL_MS = 4 * 60 * 60 * 1000

function base64UrlToBytes(s: string): Uint8Array {
  let pad = s.length % 4
  if (pad) s = s + '='.repeat(4 - pad)
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function bytesToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}
async function deriveSigningKeyBytes(): Promise<Uint8Array | null> {
  // Mirror lib/impersonation.ts getSigningKey() fallback so sign/verify agree.
  // PROD MUST set IMPERSONATION_SIGNING_KEY (hex). The SUPABASE_SERVICE_ROLE_KEY
  // fallback below is a dev convenience — rotating the service key would silently
  // invalidate all live impersonation cookies.
  const explicit = process.env.IMPERSONATION_SIGNING_KEY
  if (explicit) return hexToBytes(explicit)
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!fallback) return null
  const seedBytes = new TextEncoder().encode('serviqfm-impersonation:' + fallback)
  const digest = await crypto.subtle.digest('SHA-256', seedBytes)
  return new Uint8Array(digest)
}

async function verifyImpersonationCookieEdge(token: string | undefined | null): Promise<
  { valid: true; orgId: string; platformAdminId: string } | { valid: false }
> {
  if (!token || typeof token !== 'string') return { valid: false }
  const parts = token.split('.')
  if (parts.length !== 2) return { valid: false }
  const [bodyB64, signature] = parts
  const keyBytes = await deriveSigningKeyBytes()
  if (!keyBytes) return { valid: false }
  const key = await crypto.subtle.importKey(
    'raw', keyBytes.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const msgBytes = new TextEncoder().encode(bodyB64)
  const sigBuf = await crypto.subtle.sign('HMAC', key, msgBytes.buffer as ArrayBuffer)
  const expected = bytesToBase64Url(sigBuf)
  if (expected.length !== signature.length) return { valid: false }
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  if (diff !== 0) return { valid: false }
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(bodyB64))) as {
      org_id: string; issued_at: number; platform_admin_id: string
    }
    if (Date.now() - payload.issued_at > IMPERSONATION_TTL_MS) return { valid: false }
    if (!payload.platform_admin_id) return { valid: false }
    return { valid: true, orgId: payload.org_id, platformAdminId: payload.platform_admin_id }
  } catch {
    return { valid: false }
  }
}

// DV-31: build a user-session Supabase client whose refreshed cookies are captured
// so we can write them back onto whatever response we return (redirect/rewrite/next).
// Previously setAll was a no-op, so a token Supabase refreshed mid-middleware was lost
// and the user re-authed on the next load. The same client is reused for the MKT-21
// AAL check so getAuthenticatorAssuranceLevel() runs on the user session, not admin.
function makeUserClient(req: NextRequest) {
  const refreshed: { name: string; value: string; options: CookieOptions }[] = []
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const c of cookiesToSet) refreshed.push(c)
        },
      },
    }
  )
  // Copy any refreshed auth cookies onto the outgoing response before we return it.
  const applyCookies = <T extends NextResponse>(res: T): T => {
    for (const { name, value, options } of refreshed) res.cookies.set(name, value, options)
    return res
  }
  const getUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    } catch {
      return null
    }
  }
  return { supabase, getUser, applyCookies }
}

// P0 (playbook §2 A2): the workspace split. `organisations.has_cafm` /
// `has_procurement` decide which half of /dashboard a tenant may reach. A
// procurement-only tenant still uses the CAFM pages listed below — vendors, POs,
// inventory, invoices, cost centers, reports and settings are SHARED, not
// duplicated (A1) — so those prefixes stay reachable; everything else in
// /dashboard (work orders, assets, PM, …) is CAFM-only.
const PROCUREMENT_SHARED_PREFIXES = [
  '/dashboard/purchase-orders',
  '/dashboard/vendors',
  '/dashboard/inventory',
  '/dashboard/invoices',
  '/dashboard/cost-centers',
  '/dashboard/reports',
  '/dashboard/settings',
]
const underPrefix = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + '/')

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // /platform/* gate (covers '/platform' exact too — the matcher allows it but
  // startsWith('/platform/') would miss the bare path)
  if (path === '/platform' || path.startsWith('/platform/')) {
    const { supabase: userClient, getUser, applyCookies } = makeUserClient(req)
    const user = await getUser()
    if (!user) {
      return applyCookies(NextResponse.redirect(new URL('/login/employee', req.url)))
    }
    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { count } = await supabase
      .from('platform_admins')
      .select('id', { count: 'exact', head: true })
      .eq('id', user.id)
    if (count === 0) {
      // Mask portal existence — return 404
      return applyCookies(NextResponse.rewrite(new URL('/404', req.url)))
    }

    // MKT-21: MFA login-time AAL gate. If the admin has an enrolled factor
    // (nextLevel === 'aal2') but this session hasn't stepped up (currentLevel
    // === 'aal1'), force the second factor before reaching /platform. FAIL OPEN:
    // any error, or no enrolled factor (nextLevel !== 'aal2'), lets them through
    // unchanged — we never lock out admins who haven't set up MFA.
    try {
      const { data: aal } = await userClient.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal && aal.nextLevel === 'aal2' && aal.currentLevel === 'aal1') {
        // The /mfa page can only challenge TOTP. Only step-up when a verified TOTP
        // factor exists; a verified non-TOTP factor (e.g. phone) would dead-end
        // there, so fail open in that case rather than lock the admin out.
        const { data: factors } = await userClient.auth.mfa.listFactors()
        const hasTotp = !!factors?.totp?.some(f => f.status === 'verified')
        if (hasTotp) {
          const url = new URL('/mfa', req.url)
          url.searchParams.set('next', path)
          return applyCookies(NextResponse.redirect(url))
        }
      }
    } catch {
      // fail open
    }
    return applyCookies(NextResponse.next())
  }

  // /dashboard/* gate (covers '/dashboard' exact too)
  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    const { getUser, applyCookies } = makeUserClient(req)
    const user = await getUser()
    if (!user) {
      return applyCookies(NextResponse.redirect(new URL('/login/client', req.url)))
    }

    const impersonationCookie = req.cookies.get(IMPERSONATION_COOKIE_NAME)
    if (impersonationCookie) {
      const verified = await verifyImpersonationCookieEdge(impersonationCookie.value)
      // The cookie is only honoured when the currently-logged-in user IS the
      // platform admin who minted it — a stolen/replayed cookie under another
      // session is treated as no-impersonation.
      if (verified.valid && verified.platformAdminId === user.id) {
        return applyCookies(NextResponse.next())
      }
      // Stale/invalid/mismatched cookie — clear it and continue with normal flow
      const res = applyCookies(NextResponse.next())
      res.cookies.delete(IMPERSONATION_COOKIE_NAME)
      return res
    }

    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Profile lookup. Some Supabase projects are missing the `disabled` column or the
    // `organisations.offboarded_at` column (Sprint F migration); the joined select would
    // then fail and PostgREST returns null — which the middleware used to read as 'no
    // profile' and log the user out on every navigation. Do this defensively:
    //  1. Try the full select (with the P0 workspace flags, then without); if both
    //     error, fall back to a minimal id check.
    //  2. Only deny access if we can prove the user is disabled or their org is
    //     offboarded — otherwise let them through.
    type Profile = {
      role: string | null
      is_active: boolean | null
      disabled: boolean | null
      must_change_password: boolean | null
      organisations: { offboarded_at: string | null; has_cafm?: boolean | null; has_procurement?: boolean | null } | null
    }
    type ProfileResult = { data: Profile | null; error: { code?: string; message?: string } | null }
    const PROFILE_BASE = 'role, is_active, disabled, must_change_password, organisations(offboarded_at'
    const selectProfile = (cols: string) => supabase
      .from('users')
      .select(cols)
      .eq('id', user.id)
      .maybeSingle() as unknown as Promise<ProfileResult>

    // Try with the P0 workspace flags; if organisations doesn't have them yet
    // (procurement-01-workspace.sql not run), fall back to the flag-less select
    // so every check below — disabled, offboarded, password, requester — keeps
    // running exactly as it does today instead of dropping to the minimal path.
    let full = await selectProfile(PROFILE_BASE + ', has_cafm, has_procurement)')
    if (full.error) full = await selectProfile(PROFILE_BASE + ')')

    if (full.error) {
      console.warn('[middleware] full profile query failed, falling back', full.error)
      const { data: simple } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()
      if (!simple) {
        return applyCookies(NextResponse.redirect(new URL('/login/client?reason=no_profile', req.url)))
      }
      return applyCookies(NextResponse.next())
    }

    const profile = full.data
    if (!profile) {
      return applyCookies(NextResponse.redirect(new URL('/login/client?reason=no_profile', req.url)))
    }
    if (profile.is_active === false || profile.disabled === true || profile.organisations?.offboarded_at) {
      return applyCookies(NextResponse.redirect(new URL('/login/client?reason=disabled', req.url)))
    }

    // Force a password change after a temp-password first login (DV-09). /change-password
    // is a top-level route not covered by this matcher, so there is no redirect loop.
    if (profile.must_change_password === true) {
      return applyCookies(NextResponse.redirect(new URL('/change-password', req.url)))
    }

    // CORE-19: requesters are submit-and-track only — keep them out of the dashboard.
    // /request is top-level (not under this matcher), so there is no redirect loop.
    if (profile.role === 'requester') {
      return applyCookies(NextResponse.redirect(new URL('/request', req.url)))
    }

    // P0 workspace routing. Both flags read permissively: a missing column or a
    // pre-migration DB gives hasCafm=true / hasProcurement=false, i.e. today's
    // CAFM-only behavior, and none of the branches below fire.
    const org = profile.organisations
    const hasCafm = org?.has_cafm !== false
    const hasProcurement = org?.has_procurement === true
    const inProcurement = underPrefix(path, '/dashboard/procurement')

    if (path === '/dashboard/workspace-selector') {
      // Only a both-workspace tenant has a choice to make.
      if (!(hasCafm && hasProcurement)) {
        return applyCookies(NextResponse.redirect(new URL(hasProcurement ? '/dashboard/procurement' : '/dashboard', req.url)))
      }
    } else if (inProcurement && !hasProcurement) {
      return applyCookies(NextResponse.redirect(new URL('/dashboard', req.url)))
    } else if (!hasCafm && hasProcurement && !PROCUREMENT_SHARED_PREFIXES.some(p => underPrefix(path, p))) {
      return applyCookies(NextResponse.redirect(new URL('/dashboard/procurement', req.url)))
    }

    return applyCookies(NextResponse.next())
  }

  return NextResponse.next()
}
