import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { verifyImpersonationCookie, IMPERSONATION_COOKIE_NAME } from './impersonation'

let cachedOrgId: string | null = null
let cachedUserId: string | null = null
let cacheTime: number = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

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
          return {
            orgId: verified.orgId,
            userId: verified.platformAdminId,
            impersonating: true,
            actorPlatformAdminId: verified.platformAdminId,
          }
        }
      }
    } catch {
      // cookies() throws in non-request contexts (e.g., during static analysis) — ignore
    }
  }

  // 2. Cached normal flow
  const now = Date.now()
  if (cachedOrgId && cachedUserId && (now - cacheTime) < CACHE_TTL) {
    return { orgId: cachedOrgId, userId: cachedUserId, impersonating: false }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { orgId: null, userId: null, impersonating: false }

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { orgId: null, userId: null, impersonating: false }

  cachedOrgId = profile.organisation_id
  cachedUserId = user.id
  cacheTime = now

  return { orgId: profile.organisation_id, userId: user.id, impersonating: false }
}

export function clearOrgCache() {
  cachedOrgId = null
  cachedUserId = null
  cacheTime = 0
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
