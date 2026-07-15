// web/src/app/api/users/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'

export const dynamic = 'force-dynamic'

// 1C-15 coercion: numeric rate (>= 0 or null) and a text[] of skill categories.
function coerceRate(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}
function coerceCategories(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((c): c is string => typeof c === 'string' && c.trim() !== '')
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing user id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id, role')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[users PATCH] profile lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }
  if (profile.role !== 'admin' && profile.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as Record<string, unknown>

  const enforcePayload: Record<string, unknown> = {
    full_name: body.full_name,
    full_name_ar: body.full_name_ar,
    role: body.role,
    is_active: body.is_active,
  }

  const enforcement = await enforceFieldConfig(profile.organisation_id, 'users_edit', enforcePayload)
  if ('error' in enforcement) {
    return NextResponse.json({ error: enforcement.error }, { status: 400 })
  }
  const cleaned = enforcement.cleaned

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Load the target row (org-scoped) for the role-safety checks below.
  const { data: target, error: targetErr } = await admin
    .from('users')
    .select('id, role, is_active')
    .eq('id', id)
    .eq('organisation_id', profile.organisation_id)
    .maybeSingle()
  if (targetErr) {
    console.error('[users PATCH] target lookup failed', targetErr)
    return NextResponse.json({ error: 'Failed to load target user' }, { status: 500 })
  }
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const newRole = 'role' in cleaned && typeof cleaned.role === 'string' ? cleaned.role : undefined
  const newActive = 'is_active' in cleaned && typeof cleaned.is_active === 'boolean' ? cleaned.is_active : undefined

  // SAFETY (a): a user may never change their own role — prevents accidental
  // self-demotion and self-promotion alike.
  if (user.id === id && newRole !== undefined && newRole !== target.role) {
    return NextResponse.json(
      { error: 'You cannot change your own role. Ask another admin to do it.', code: 'self_role_change' },
      { status: 400 }
    )
  }

  // SAFETY (b) + (c): last-admin protection. Refuse demoting or deactivating
  // an active admin if that would leave the organisation with zero active admins.
  const targetIsActiveAdmin = target.role === 'admin' && target.is_active !== false
  const demotesAdmin = targetIsActiveAdmin && newRole !== undefined && newRole !== 'admin'
  const deactivatesAdmin = targetIsActiveAdmin && newActive === false
  if (demotesAdmin || deactivatesAdmin) {
    const { count: otherAdmins, error: countErr } = await admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', profile.organisation_id)
      .eq('role', 'admin')
      .eq('is_active', true)
      .neq('id', id)
    if (countErr) {
      console.error('[users PATCH] admin count failed', countErr)
      return NextResponse.json({ error: 'Failed to verify admin count' }, { status: 500 })
    }
    if ((otherAdmins ?? 0) === 0) {
      return NextResponse.json(
        demotesAdmin
          ? { error: 'Cannot remove the admin role from the only remaining active admin of this organisation.', code: 'last_admin_role' }
          : { error: 'Cannot deactivate the only remaining active admin of this organisation.', code: 'last_admin_deactivate' },
        { status: 400 }
      )
    }
  }

  const updateRow: Record<string, unknown> = {
    full_name: cleaned.full_name ?? null,
    full_name_ar: cleaned.full_name_ar ? cleaned.full_name_ar : null,
    role: cleaned.role ?? null,
    is_active: typeof cleaned.is_active === 'boolean' ? cleaned.is_active : null,
    updated_at: new Date().toISOString(),
  }

  // Strip any fields that enforcement removed (hidden) so we don't overwrite with null
  // by checking the cleaned payload directly: only update keys present in cleaned.
  const finalUpdate: Record<string, unknown> = { updated_at: updateRow.updated_at }
  if ('full_name' in cleaned) finalUpdate.full_name = updateRow.full_name
  if ('full_name_ar' in cleaned) finalUpdate.full_name_ar = updateRow.full_name_ar
  if ('role' in cleaned) finalUpdate.role = updateRow.role
  if ('is_active' in cleaned) finalUpdate.is_active = updateRow.is_active

  // 1C-07: deactivating a user must silence their device. Clear the Expo push
  // token/platform so no push can reach them even before the fan-out is-active
  // filters catch up. (is_active guards email/in-app; this guards push at source.)
  if (newActive === false) {
    finalUpdate.push_token = null
    finalUpdate.push_platform = null
  }

  // 1C-15 admin-editable fields — not in the field catalog, so they skip
  // enforceFieldConfig and are read straight from the body. Only keys the
  // client actually sent are written (partial-PATCH safe).
  if ('phone' in body) finalUpdate.phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null
  if ('job_title' in body) finalUpdate.job_title = typeof body.job_title === 'string' && body.job_title.trim() ? body.job_title.trim() : null
  if ('skill_categories' in body) finalUpdate.skill_categories = coerceCategories(body.skill_categories)
  // hourly_rate is admin-only: managers may edit users but not set pay rate.
  if ('hourly_rate' in body && profile.role === 'admin') finalUpdate.hourly_rate = coerceRate(body.hourly_rate)

  const { error } = await admin
    .from('users')
    .update(finalUpdate)
    .eq('id', id)
    .eq('organisation_id', profile.organisation_id)
  if (error) {
    console.error('[users PATCH] update failed', error)
    return NextResponse.json({ error: error.message || 'Failed to update user' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
