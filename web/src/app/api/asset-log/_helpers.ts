// Shared auth/role/admin-client boilerplate for the Asset Log write routes.
// Four routes route through here — this is dedup, not speculative abstraction.

import { NextResponse } from 'next/server'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getOrgId } from '@/lib/auth-helper'
import { DEFAULT_ASSET_LOG_TYPES } from '@/lib/asset-log'

export type CallerCtx = {
  userId: string
  orgId: string
  role: string
  admin: SupabaseClient
}

// Authenticates, loads the caller profile (org from the profile, never the body),
// gates on the allowed roles, and hands back a service-role client for the write.
// Returns a NextResponse (already an error) OR a CallerCtx on success.
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
    console.error('[asset-log] profile lookup failed', profileErr)
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

// Best-effort audit row for an asset-log item (entity_type='asset_log_item',
// matching the WO convention). Never throws.
export async function auditAssetLog(
  admin: SupabaseClient,
  ctx: { userId: string; orgId: string },
  itemId: string,
  action: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values?: { old_values?: any; new_values?: any }
): Promise<void> {
  try {
    const { impersonating, actorPlatformAdminId } = await getOrgId()
    await admin.from('audit_logs').insert({
      entity_type: 'asset_log_item',
      entity_id: itemId,
      action,
      user_id: ctx.userId,
      organisation_id: ctx.orgId,
      old_values: values?.old_values ?? null,
      new_values: values?.new_values ?? null,
      impersonated_by: impersonating ? actorPlatformAdminId : null,
    })
  } catch (err) {
    console.error('[asset-log] audit log failed', err)
  }
}

// Seeds the 5 default item types for an org that has none yet (idempotent by count).
export async function seedDefaultTypesIfEmpty(admin: SupabaseClient, orgId: string): Promise<void> {
  const { count } = await admin
    .from('asset_log_types')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', orgId)
  if (count && count > 0) return
  await admin.from('asset_log_types').insert(
    DEFAULT_ASSET_LOG_TYPES.map(t => ({ organisation_id: orgId, ...t }))
  )
}
