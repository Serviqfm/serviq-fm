// web/src/middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

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
async function verifyImpersonationCookieEdge(token: string | undefined | null): Promise<
  { valid: true; orgId: string } | { valid: false }
> {
  if (!token || typeof token !== 'string') return { valid: false }
  const parts = token.split('.')
  if (parts.length !== 2) return { valid: false }
  const [bodyB64, signature] = parts
  const keyHex = process.env.IMPERSONATION_SIGNING_KEY
  if (!keyHex) return { valid: false }
  const keyBytes = hexToBytes(keyHex)
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
      org_id: string; issued_at: number
    }
    if (Date.now() - payload.issued_at > IMPERSONATION_TTL_MS) return { valid: false }
    return { valid: true, orgId: payload.org_id }
  } catch {
    return { valid: false }
  }
}

async function getUserFromRequest(req: NextRequest) {
  // We need a mutable cookie set so @supabase/ssr can refresh tokens during the call.
  // For middleware, we wrap the cookie store: we forward to req.cookies for reads.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // If Supabase refreshes the access token mid-middleware, we'd want to write
          // it back. For now we ignore (the client-side will re-auth on next page load
          // if refresh is needed). This avoids the complexity of carrying a NextResponse
          // through the function.
          for (const { name, value, options } of cookiesToSet) {
            // no-op
            void name; void value; void options
          }
        },
      },
    }
  )
  try {
    const { data: { user } } = await supabase.auth.getUser()
    return user
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // /platform/* gate
  if (path.startsWith('/platform/')) {
    const user = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.redirect(new URL('/login/employee', req.url))
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
      return NextResponse.rewrite(new URL('/404', req.url))
    }
    return NextResponse.next()
  }

  // /dashboard/* gate
  if (path.startsWith('/dashboard/')) {
    const user = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.redirect(new URL('/login/client', req.url))
    }

    const impersonationCookie = req.cookies.get(IMPERSONATION_COOKIE_NAME)
    if (impersonationCookie) {
      const verified = await verifyImpersonationCookieEdge(impersonationCookie.value)
      if (verified.valid) {
        return NextResponse.next()
      }
      // Stale/invalid cookie — clear it and continue with normal flow
      const res = NextResponse.next()
      res.cookies.delete(IMPERSONATION_COOKIE_NAME)
      return res
    }

    const supabase = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: profile } = await supabase
      .from('users')
      .select('is_active, disabled, organisations(offboarded_at)')
      .eq('id', user.id)
      .single() as { data: { is_active: boolean; disabled: boolean; organisations: { offboarded_at: string | null } | null } | null }

    if (!profile) {
      return NextResponse.redirect(new URL('/login/client?reason=no_profile', req.url))
    }
    if (profile.is_active === false || profile.disabled === true || profile.organisations?.offboarded_at) {
      return NextResponse.redirect(new URL('/login/client?reason=disabled', req.url))
    }

    return NextResponse.next()
  }

  return NextResponse.next()
}
