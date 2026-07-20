// web/src/app/api/work-orders/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'
import { deliverWebhookEvent } from '@/lib/webhookDelivery'
import { slaDueDates } from '@/lib/sla'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[work-orders POST] profile lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const body = (await req.json()) as Record<string, unknown>

  // Separate non-catalog/system fields from the field-config-gated fields.
  // is_recurring is a UI-only field (used to decide `source`), not a column.
  const isRecurring = body.is_recurring === true || body.is_recurring === 'true'
  const photoUrls = Array.isArray(body.photo_urls) ? (body.photo_urls as string[]) : []

  // Build payload that matches catalog keys for enforcement.
  const enforcePayload: Record<string, unknown> = {
    title: body.title,
    description: body.description,
    priority: body.priority,
    category: body.category,
    site_id: body.site_id,
    asset_id: body.asset_id,
    assigned_to: body.assigned_to,
    due_at: body.due_at,
    sla_hours: body.sla_hours,
    is_recurring: isRecurring ? 'true' : '',
    recurrence_frequency: body.recurrence_frequency,
    photos: photoUrls.length > 0 ? photoUrls : '',
  }

  const enforcement = await enforceFieldConfig(profile.organisation_id, 'work_orders_new', enforcePayload)
  if ('error' in enforcement) {
    return NextResponse.json({ error: enforcement.error }, { status: 400 })
  }
  const cleaned = enforcement.cleaned

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const slaHours = cleaned.sla_hours
  const slaParsed = typeof slaHours === 'string' && slaHours.trim() !== ''
    ? parseInt(slaHours)
    : typeof slaHours === 'number'
      ? slaHours
      : null

  const insertRow: Record<string, unknown> = {
    organisation_id: profile.organisation_id,
    created_by: user.id,
    title: cleaned.title ?? null,
    description: cleaned.description ? cleaned.description : null,
    priority: cleaned.priority ?? 'medium',
    category: cleaned.category ? cleaned.category : null,
    site_id: cleaned.site_id ? cleaned.site_id : null,
    asset_id: cleaned.asset_id ? cleaned.asset_id : null,
    assigned_to: cleaned.assigned_to ? cleaned.assigned_to : null,
    due_at: cleaned.due_at ? cleaned.due_at : null,
    sla_hours: slaParsed,
    status: cleaned.assigned_to ? 'assigned' : 'new',
    // 'source' is constrained to ('manual', 'pm_schedule', 'requester'). Recurring
    // WOs are still manually-created — recurrence is captured by is_recurring +
    // recurrence_frequency below, not by the source column.
    source: 'manual',
    photo_urls: Array.isArray(cleaned.photos) ? cleaned.photos : photoUrls,
  }

  // FM-03: when the caller didn't set a resolution due date, apply the org's SLA policy
  // for this priority — sla_response_due_at (response target) + due_at (resolution target).
  // Table/columns may be absent pre-migration; a missing policy just leaves due_at empty.
  if (!insertRow.due_at) {
    const { data: policy } = await admin
      .from('sla_policies')
      .select('response_minutes, resolution_minutes')
      .eq('organisation_id', profile.organisation_id)
      .eq('priority', insertRow.priority)
      .maybeSingle()
    if (policy) {
      const { sla_response_due_at, due_at } = slaDueDates(policy, Date.now())
      insertRow.sla_response_due_at = sla_response_due_at
      if (due_at) insertRow.due_at = due_at
    }
  }

  const { data, error } = await admin
    .from('work_orders')
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    console.error('[work-orders POST] insert failed', error)
    return NextResponse.json({ error: error.message || 'Failed to create work order' }, { status: 500 })
  }

  // MKT-19: fire wo.created to registered webhooks (fire-and-forget, mirrors
  // the wo.status_changed wiring in [id]/close).
  void deliverWebhookEvent(profile.organisation_id, 'wo.created', {
    id: (data as { id?: string })?.id ?? null,
    wo_number: (data as { wo_number?: number | null })?.wo_number ?? null,
    title: insertRow.title ?? null,
    status: insertRow.status,
    priority: insertRow.priority,
    site_id: insertRow.site_id,
    asset_id: insertRow.asset_id,
  })

  return NextResponse.json({ work_order: data })
}
