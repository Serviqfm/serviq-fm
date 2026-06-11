import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendRequestApproved } from '@/lib/email'
import { escapeHtml } from '@/lib/escapeHtml'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Use the cookie-backed server client to identify the caller (the tenant admin
  // pressing 'Approve'). created_by on the WO comes from here.
  const serverSupabase = await createServerSupabaseClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load the caller's profile — only admins/managers of the request's org may approve.
  const { data: callerProfile } = await serverSupabase
    .from('users')
    .select('organisation_id, role')
    .eq('id', user.id)
    .single()
  if (!callerProfile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }
  if (!['admin', 'manager'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Service role for the actual inserts so spaces/work_orders RLS does not bite.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const body = await req.json()
  const { priority, due_date } = body

  const { data: request } = await admin
    .from('requests')
    .select('*, site:site_id(name, organisation_id)')
    .eq('id', params.id)
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // Org check: the request must belong to the caller's organisation.
  if (request.organisation_id !== callerProfile.organisation_id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  const { data: wo, error: woErr } = await admin
    .from('work_orders')
    .insert({
      organisation_id: request.organisation_id,
      site_id: request.site_id,
      space_id: request.space_id,
      request_id: request.id,
      title: request.title,
      description: request.description,
      category: request.category,
      priority: priority || 'medium',
      status: 'new',
      assigned_to: null,
      due_at: due_date || null,
      // Some Supabase projects have a check constraint that doesn't allow
      // 'requester' in work_orders.source. Use 'manual' which is universally
      // allowed; the origin is still traceable via request_id (set above).
      source: 'manual',
      created_by: user.id,
    })
    .select()
    .single()

  if (woErr) return NextResponse.json({ error: woErr.message }, { status: 500 })

  await admin.from('requests').update({
    status: 'approved',
    work_order_id: wo.id,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${request.tracking_token}`
  const woNum = `WO-${String(wo.wo_number).padStart(4, '0')}`

  try {
    await sendRequestApproved({
      to: request.requester_email,
      // Escape user-supplied values — lib/email interpolates these into HTML.
      name: escapeHtml(request.requester_name),
      siteName: escapeHtml((request.site as { name: string }).name),
      woNumber: woNum,
      trackingUrl,
    })
  } catch { /* non-blocking */ }

  return NextResponse.json({ success: true, wo_id: wo.id, wo_number: woNum })
}
