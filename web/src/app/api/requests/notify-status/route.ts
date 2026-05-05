import { NextRequest, NextResponse } from 'next/server'
import { sendWOStatusUpdate } from '@/lib/email'

export async function POST(req: NextRequest) {
  const { requester_name, requester_email, site_name, tracking_token, status } = await req.json()
  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${tracking_token}`
  try {
    await sendWOStatusUpdate({
      to: requester_email,
      name: requester_name,
      siteName: site_name,
      status,
      trackingUrl,
    })
  } catch { /* non-blocking */ }
  return NextResponse.json({ success: true })
}
