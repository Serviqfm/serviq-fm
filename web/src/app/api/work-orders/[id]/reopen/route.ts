// web/src/app/api/work-orders/[id]/reopen/route.ts
//
// CORE-03: manager/admin-only reopen of a completed or closed work order, with a
// mandatory reason recorded in the audit trail (visible in the WO History tab).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getOrgId } from '@/lib/auth-helper'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing work order id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  if (!['admin', 'manager'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Only a manager or admin can reopen a work order' }, { status: 403 })
  }

  const { reason } = (await req.json().catch(() => ({ reason: '' }))) as { reason?: string }
  if (typeof reason !== 'string' || reason.trim().length < 3) {
    return NextResponse.json({ error: 'A reason (at least 3 characters) is required to reopen.' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: existing } = await admin.from('work_orders').select('status, organisation_id').eq('id', id).maybeSingle()
  if (!existing || existing.organisation_id !== profile.organisation_id) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }
  if (!['completed', 'closed'].includes(existing.status)) {
    return NextResponse.json({ error: 'Only completed or closed work orders can be reopened.' }, { status: 400 })
  }

  const { error } = await admin.from('work_orders').update({
    status: 'in_progress',
    completed_at: null,
    closed_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('organisation_id', profile.organisation_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit trail (best-effort) — the reason lands in the WO History tab.
  try {
    const { impersonating, actorPlatformAdminId } = await getOrgId()
    await admin.from('audit_logs').insert({
      entity_type: 'work_order',
      entity_id: id,
      action: `Reopened (was ${existing.status})`,
      user_id: user.id,
      organisation_id: profile.organisation_id,
      new_values: { status: 'in_progress' },
      old_values: { status: existing.status },
      details: reason.trim(),
      impersonated_by: impersonating ? actorPlatformAdminId : null,
    })
  } catch (auditErr) {
    console.error('[work-orders reopen] audit log failed', auditErr)
  }

  return NextResponse.json({ success: true })
}
