// web/src/middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { verifyImpersonationCookie, IMPERSONATION_COOKIE_NAME } from './lib/impersonation'

export const config = {
  matcher: ['/platform/:path*', '/dashboard/:path*'],
}

async function getSessionUser(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value
    ?? req.cookies.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_REF}-auth-token`)?.value
  if (!accessToken) return null
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  try {
    // accessToken may be a JSON-encoded array — handle both formats
    let token = accessToken
    if (accessToken.startsWith('[')) {
      const parsed = JSON.parse(accessToken)
      token = parsed[0] ?? accessToken
    }
    const { data } = await supabase.auth.getUser(token)
    return data.user
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // /platform/* gate
  if (path.startsWith('/platform/')) {
    const user = await getSessionUser(req)
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
    const user = await getSessionUser(req)
    if (!user) {
      return NextResponse.redirect(new URL('/login/client', req.url))
    }

    const impersonationCookie = req.cookies.get(IMPERSONATION_COOKIE_NAME)
    if (impersonationCookie) {
      const verified = verifyImpersonationCookie(impersonationCookie.value)
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
