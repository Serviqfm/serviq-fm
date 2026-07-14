// Shared auth/role/admin-client boilerplate for the purchase-order write routes.
// Mirrors web/src/app/api/asset-log/_helpers.ts — dedup, not speculative abstraction.

import { NextResponse } from 'next/server'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export type CallerCtx = {
  userId: string
  orgId: string
  role: string
  admin: SupabaseClient
}

// Authenticates, loads the caller profile (org from the profile, never the body),
// gates on the allowed roles, and hands back a service-role client for the write.
export async function resolveCaller(allowedRoles: string[]): Promise<NextResponse | CallerCtx> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id, role')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[purchase-orders] profile lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }
  if (!allowedRoles.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  return { userId: user.id, orgId: profile.organisation_id, role: profile.role, admin }
}
