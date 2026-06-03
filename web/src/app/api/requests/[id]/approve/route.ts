import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRequestApproved } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const authHeader = req.headers.get('authorization')
  const { data: { user } } = await supabase.auth.getUser(authHeader?.replace('Bearer ', '') || '')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { priority, due_date } = body

  const { data: request } = await supabase
    .from('requests')
    .select('*, site:site_id(name, organisation_id)')
    .eq('id', params.id)
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { data: wo, error: woErr } = await supabase
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
      source: 'requester',
    })
    .select()
    .single()

  if (woErr) return NextResponse.json({ error: woErr.message }, { status: 500 })

  await supabase.from('requests').update({
    status: 'approved',
    work_order_id: wo.id,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${request.tracking_token}`
  const woNum = `WO-${String(wo.wo_number).padStart(4, '0')}`

  try {
    await sendRequestApproved({
      to: request.requester_email,
      name: request.requester_name,
      siteName: (request.site as { name: string }).name,
      woNumber: woNum,
      trackingUrl,
    })
  } catch { /* non-blocking */ }

  return NextResponse.json({ success: true, wo_id: wo.id, wo_number: woNum })
}
