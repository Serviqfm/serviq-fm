// web/src/app/api/work-orders/[id]/close/route.ts
//
// Handles status transitions to `completed` and `closed`.
// Enforces field config for `work_orders_close` (e.g. closeout_photos).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'
import { getOrgId } from '@/lib/auth-helper'
import type { WorkOrderStatus } from '@/types/work-order'

export const dynamic = 'force-dynamic'

const VALID_STATUSES: WorkOrderStatus[] = ['completed', 'closed']

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing work order id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[work-orders close POST] profile lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const body = (await req.json()) as {
    status?: WorkOrderStatus
    closeout_photo_urls?: string[]
    signoff?: string
  }

  const newStatus = body.status
  if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
    return NextResponse.json({ error: 'Invalid or missing status (must be completed or closed)' }, { status: 400 })
  }

  const closeoutPhotoUrls = Array.isArray(body.closeout_photo_urls) ? body.closeout_photo_urls : []

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Load existing WO for org-scope, status fallback, and existing photo merge.
  const { data: existingWO, error: loadErr } = await admin
    .from('work_orders')
    .select('id, organisation_id, status, photo_urls')
    .eq('id', id)
    .single()
  if (loadErr || !existingWO) {
    console.error('[work-orders close POST] load failed', loadErr)
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }
  if (existingWO.organisation_id !== profile.organisation_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const existingPhotos: string[] = Array.isArray(existingWO.photo_urls) ? existingWO.photo_urls : []
  const allPhotos = [...existingPhotos, ...closeoutPhotoUrls]

  // Field-config enforcement: 'closeout_photos required' is satisfied by EITHER newly uploaded
  // close-out photos OR photos already attached to the work order from earlier (the Photos tab).
  const enforcePayload: Record<string, unknown> = {
    closeout_photos: allPhotos.length > 0 ? allPhotos : '',
  }
  const enforcement = await enforceFieldConfig(profile.organisation_id, 'work_orders_close', enforcePayload)
  if ('error' in enforcement) {
    return NextResponse.json({ error: enforcement.error }, { status: 400 })
  }

  const updateRow: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
    ...(newStatus === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    ...(newStatus === 'closed' ? { closed_at: new Date().toISOString() } : {}),
    ...(closeoutPhotoUrls.length > 0 ? { photo_urls: allPhotos } : {}),
    ...(body.signoff ? { completion_notes: `Signed off by: ${body.signoff}` } : {}),
  }

  const { data, error } = await admin
    .from('work_orders')
    .update(updateRow)
    .eq('id', id)
    .eq('organisation_id', profile.organisation_id)
    .select()
    .single()

  if (error) {
    console.error('[work-orders close POST] update failed', error)
    return NextResponse.json({ error: error.message || 'Failed to update work order' }, { status: 500 })
  }

  // Audit log (best-effort)
  try {
    const { impersonating, actorPlatformAdminId } = await getOrgId()
    await admin.from('audit_logs').insert({
      entity_type: 'work_order',
      entity_id: id,
      action: `Status changed to ${newStatus}${body.signoff ? ` — signed off by ${body.signoff}` : ''}`,
      user_id: user.id,
      organisation_id: profile.organisation_id,
      new_values: { status: newStatus },
      old_values: { status: existingWO.status },
      impersonated_by: impersonating ? actorPlatformAdminId : null,
    })
  } catch (auditErr) {
    console.error('[work-orders close POST] audit log failed', auditErr)
  }

  return NextResponse.json({ work_order: data })
}
