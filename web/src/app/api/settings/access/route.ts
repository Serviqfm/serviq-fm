// web/src/app/api/settings/access/route.ts
// 1C-13 "Limited Technician": read/write the org-level
// organisations.limit_technician_visibility toggle. Writes are admin/manager-gated
// here and go through the service role, so the toggle never depends on client RLS.
// The DB enforcement itself is the RESTRICTIVE work_orders SELECT policy shipped
// in docs/superpowers/sql/1c-13-limited-technician.sql.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function getProfile() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.organisation_id) return null
  return profile as { organisation_id: string; role: string | null }
}

export async function GET() {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  // Column may not exist yet (migration not applied) — treat any error as "off".
  const { data, error } = await admin
    .from('organisations')
    .select('limit_technician_visibility')
    .eq('id', profile.organisation_id)
    .single()
  return NextResponse.json({
    limit_technician_visibility: error
      ? false
      : ((data as { limit_technician_visibility?: boolean | null } | null)?.limit_technician_visibility ?? false),
    migrated: !error,
    role: profile.role ?? '',
  })
}

export async function PATCH(req: NextRequest) {
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin' && profile.role !== 'manager') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof body.limit_technician_visibility !== 'boolean') {
    return NextResponse.json({ error: 'limit_technician_visibility must be a boolean' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await admin
    .from('organisations')
    .update({ limit_technician_visibility: body.limit_technician_visibility })
    .eq('id', profile.organisation_id)
  if (error) {
    // Most likely: 1c-13-limited-technician.sql not applied yet.
    console.error('[settings/access PATCH] update failed', error)
    return NextResponse.json({ error: error.message || 'Failed to save' }, { status: 500 })
  }
  return NextResponse.json({ limit_technician_visibility: body.limit_technician_visibility })
}
