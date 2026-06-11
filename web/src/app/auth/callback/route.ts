import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {}
          },
        },
      }
    )
    await supabase.auth.exchangeCodeForSession(code)

    // First-login tracking: stamp first_login_at on the user's own profile row
    // the first time they arrive with a session. Best-effort — the DB trigger
    // on auth.users.last_sign_in_at (sprint-k-06-user-invites.sql) is the
    // authoritative path covering password logins that never hit this route.
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('users')
          .update({ first_login_at: new Date().toISOString() })
          .eq('id', user.id)
          .is('first_login_at', null)
      }
    } catch {}
  }

  return NextResponse.redirect(new URL('/dashboard', request.url))
}