// web/src/app/api/work-orders/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'
import { slaTransitionPatch } from '@/lib/sla'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing work order id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id, role')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[work-orders PATCH] profile lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  // Load the existing WO to enforce lifecycle + role rules (org-scoped via RLS).
  const { data: existingWO } = await supabase
    .from('work_orders')
    .select('status, created_by, organisation_id')
    .eq('id', id)
    .maybeSingle()
  if (!existingWO || existingWO.organisation_id !== profile.organisation_id) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }
  // CORE-02: closed work orders are immutable — reopen has its own route.
  if (existingWO.status === 'closed') {
    return NextResponse.json({ error: 'Closed work orders cannot be edited. Reopen it first.' }, { status: 409 })
  }
  // WO-02: technicians may only edit work orders they created.
  if (profile.role === 'technician' && existingWO.created_by !== user.id) {
    return NextResponse.json({ error: 'Technicians can only edit work orders they created' }, { status: 403 })
  }

  const body = (await req.json()) as Record<string, unknown>

  const enforcePayload: Record<string, unknown> = {
    title: body.title,
    description: body.description,
    priority: body.priority,
    category: body.category,
    site_id: body.site_id,
    asset_id: body.asset_id,
    assigned_to: body.assigned_to,
    sla_hours: body.sla_hours,
    due_at: body.due_at,
    actual_cost: body.actual_cost,
    completion_notes: body.completion_notes,
  }

  const enforcement = await enforceFieldConfig(profile.organisation_id, 'work_orders_edit', enforcePayload)
  if ('error' in enforcement) {
    return NextResponse.json({ error: enforcement.error }, { status: 400 })
  }
  const cleaned = enforcement.cleaned

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const slaRaw = cleaned.sla_hours
  const slaParsed = typeof slaRaw === 'string' && slaRaw.trim() !== ''
    ? parseInt(slaRaw)
    : typeof slaRaw === 'number'
      ? slaRaw
      : null

  const costRaw = cleaned.actual_cost
  const costParsed = typeof costRaw === 'string' && costRaw.trim() !== ''
    ? parseFloat(costRaw)
    : typeof costRaw === 'number'
      ? costRaw
      : null

  // DV-12: vendors go in their own column (not run through field-config enforcement).
  const assignedVendorId = typeof body.assigned_vendor_id === 'string' && body.assigned_vendor_id
    ? body.assigned_vendor_id
    : null

  const updateRow: Record<string, unknown> = {
    title: cleaned.title ?? null,
    description: cleaned.description ? cleaned.description : null,
    priority: cleaned.priority ?? 'medium',
    category: cleaned.category ? cleaned.category : null,
    site_id: cleaned.site_id ? cleaned.site_id : null,
    asset_id: cleaned.asset_id ? cleaned.asset_id : null,
    assigned_to: cleaned.assigned_to ? cleaned.assigned_to : null,
    assigned_vendor_id: assignedVendorId,
    due_at: cleaned.due_at ? cleaned.due_at : null,
    sla_hours: slaParsed,
    actual_cost: costParsed,
    completion_notes: cleaned.completion_notes ? cleaned.completion_notes : null,
    // CORE-02: preserve in_progress/on_hold/completed on edit; only (re)derive
    // assigned/new from the assignment while the WO is still in those early states.
    status: ['new', 'assigned'].includes(existingWO.status)
      ? ((cleaned.assigned_to || assignedVendorId) ? 'assigned' : 'new')
      : existingWO.status,
    updated_at: new Date().toISOString(),
  }

  // FM-03: SLA-clock bookkeeping when this PATCH changes the WO status — stamp
  // first_response_at on first entry into in_progress, and start/stop the on-hold
  // pause clock. Resolution breach stays derived (completed_at vs due_at + paused),
  // so no trigger here. Columns may be absent pre-migration; tolerate + skip.
  // ponytail: the WO detail status control writes in_progress/on_hold via a direct
  // supabase update, so today that path is handled there; this covers PATCH callers.
  const newStatus = updateRow.status as string
  if (newStatus !== existingWO.status) {
    const { data: slaRow } = await supabase
      .from('work_orders')
      .select('first_response_at, sla_paused_at, sla_paused_total_minutes')
      .eq('id', id)
      .maybeSingle()
    if (slaRow) {
      Object.assign(updateRow, slaTransitionPatch({
        prevStatus: existingWO.status,
        newStatus,
        firstResponseAt: slaRow.first_response_at ?? null,
        slaPausedAt: slaRow.sla_paused_at ?? null,
        slaPausedTotalMinutes: slaRow.sla_paused_total_minutes ?? 0,
        nowMs: Date.now(),
      }))
    }
  }

  const { data, error } = await admin
    .from('work_orders')
    .update(updateRow)
    .eq('id', id)
    .eq('organisation_id', profile.organisation_id)
    .select()
    .single()

  if (error) {
    console.error('[work-orders PATCH] update failed', error)
    return NextResponse.json({ error: error.message || 'Failed to update work order' }, { status: 500 })
  }
  return NextResponse.json({ work_order: data })
}
