import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRequestConfirmation } from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.json()
  const {
    organisation_id, site_id, space_id, site_name,
    requester_name, requester_email, requester_phone,
    title, description, category, photo_urls, file_urls,
  } = body

  if (!requester_name || !requester_email || !title || !description || !category) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: request, error } = await supabase
    .from('requests')
    .insert({
      organisation_id, site_id, space_id,
      requester_name, requester_email, requester_phone,
      title, description, category,
      photo_urls: photo_urls || [],
      file_urls: file_urls || [],
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${request.tracking_token}`

  try {
    await sendRequestConfirmation({
      to: requester_email,
      name: requester_name,
      siteName: site_name,
      title,
      trackingUrl,
    })
  } catch {
    // email failure should not fail the request submission
  }

  return NextResponse.json({ success: true, tracking_token: request.tracking_token })
}
