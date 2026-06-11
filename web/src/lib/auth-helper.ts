import { createClient } from '@/lib/supabase'
import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { verifyImpersonationCookie, IMPERSONATION_COOKIE_NAME } from './impersonation'

export type OrgIdResult = {
  orgId: string | null
  userId: string | null
  impersonating: boolean
  actorPlatformAdminId?: string
}

export async function getOrgId(): Promise<OrgIdResult> {
  // 1. Check impersonation cookie first (only available in server context)
  if (typeof window === 'undefined') {
    try {
      const cookieStore = cookies()
      const impersonation = cookieStore.get(IMPERSONATION_COOKIE_NAME)
      if (impersonation) {
        const verified = verifyImpersonationCookie(impersonation.value)
        if (verified.valid) {
          // Bind the impersonation cookie to the logged-in session: the cookie
          // is only honoured when the currently-authenticated user IS the
          // platform admin who minted it. A stolen/replayed cookie under a
          // different session is treated as no-impersonation.
          const sessionSupabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
              cookies: {
                getAll() {
                  return cookieStore.getAll()
                },
                setAll() {
                  // read-only here — token refresh writes are not needed for this check
                },
              },
            }
          )
          const { data: { user: sessionUser } } = await sessionSupabase.auth.getUser()
          if (sessionUser && sessionUser.id === verified.platformAdminId) {
            return {
              orgId: verified.orgId,
              userId: verified.platformAdminId,
              impersonating: true,
              actorPlatformAdminId: verified.platformAdminId,
            }
          }
          // Session/cookie mismatch — fall through to the normal flow.
        }
      }
    } catch {
      // cookies() throws in non-request contexts (e.g., during static analysis) — ignore
    }
  }

  // 2. Normal flow — always resolved fresh per call. (A module-level cache
  // here previously bled org/user ids across requests on a warm serverless
  // instance, letting one tenant's request observe another's identity.)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { orgId: null, userId: null, impersonating: false }

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { orgId: null, userId: null, impersonating: false }

  return { orgId: profile.organisation_id, userId: user.id, impersonating: false }
}

/**
 * Returns either the user's RLS-bound Supabase client OR a service-role client
 * if the current request is an impersonation session. Always pair with getOrgId().
 */
export function getScopedSupabaseClient(impersonating: boolean) {
  if (impersonating) {
    return createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return createClient()
}
