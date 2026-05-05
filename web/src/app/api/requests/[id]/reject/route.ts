import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRequestRejected } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const authHeader = req.headers.get('authorization')
  const { data: { user } } = await supabase.auth.getUser(authHeader?.replace('Bearer ', '') || '')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reason } = await req.json()

  const { data: request } = await supabase
    .from('requests')
    .select('*, site:site_id(name)')
    .eq('id', params.id)
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  await supabase.from('requests').update({
    status: 'rejected',
    rejection_reason: reason || null,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${request.tracking_token}`

  try {
    await sendRequestRejected({
      to: request.requester_email,
      name: request.requester_name,
      siteName: (request.site as { name: string }).name,
      reason,
      trackingUrl,
    })
  } catch { /* non-blocking */ }

  return NextResponse.json({ success: true })
}
