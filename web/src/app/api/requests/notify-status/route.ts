import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendWOStatusUpdate } from '@/lib/email'
import { escapeHtml } from '@/lib/escapeHtml'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = ['in_progress', 'completed', 'finished'] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]

export async function POST(req: NextRequest) {
  // Authenticate via the cookie-bound Supabase server client.
  const serverSupabase = await createServerSupabaseClient()
  const { data: { user: caller } } = await serverSupabase.auth.getUser()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await serverSupabase
    .from('users')
    .select('organisation_id')
    .eq('id', caller.id)
    .single()
  if (!callerProfile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const { tracking_token, status } = await req.json()
  if (!tracking_token || !status) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!ALLOWED_STATUSES.includes(status as AllowedStatus)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Look up the request server-side — the recipient and site name come from the
  // stored request row (never from the body), and the request must belong to the
  // caller's organisation.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: request } = await admin
    .from('requests')
    .select('organisation_id, requester_name, requester_email, tracking_token, site:site_id(name)')
    .eq('tracking_token', tracking_token)
    .maybeSingle()

  if (!request || request.organisation_id !== callerProfile.organisation_id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }
  if (!request.requester_email) {
    return NextResponse.json({ error: 'Request has no requester email' }, { status: 400 })
  }

  const site = Array.isArray(request.site)
    ? (request.site[0] as { name: string } | undefined)
    : (request.site as { name: string } | null)

  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${request.tracking_token}`
  try {
    await sendWOStatusUpdate({
      to: request.requester_email,
      // Escape user-supplied values — lib/email interpolates these into HTML.
      name: escapeHtml(request.requester_name),
      siteName: escapeHtml(site?.name || ''),
      status: status as AllowedStatus,
      trackingUrl,
    })
  } catch { /* non-blocking */ }
  return NextResponse.json({ success: true })
}
