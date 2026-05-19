// web/src/middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { verifyImpersonationCookie, IMPERSONATION_COOKIE_NAME } from './lib/impersonation'

export const runtime = 'nodejs'

export const config = {
  matcher: ['/platform/:path*', '/dashboard/:path*'],
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
