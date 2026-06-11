import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendRequestRejected } from '@/lib/email'
import { escapeHtml } from '@/lib/escapeHtml'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Authenticate via the cookie-bound Supabase server client (same-origin
  // dashboard fetches send cookies automatically).
  const serverSupabase = await createServerSupabaseClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load the caller's profile — only admins/managers of the request's org may reject.
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

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { reason } = await req.json()

  const { data: request } = await admin
    .from('requests')
    .select('*, site:site_id(name)')
    .eq('id', params.id)
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  // Org check: the request must belong to the caller's organisation.
  if (request.organisation_id !== callerProfile.organisation_id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  await admin.from('requests').update({
    status: 'rejected',
    rejection_reason: reason || null,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${request.tracking_token}`

  try {
    await sendRequestRejected({
      to: request.requester_email,
      // Escape user-supplied values — lib/email interpolates these into HTML.
      name: escapeHtml(request.requester_name),
      siteName: escapeHtml((request.site as { name: string }).name),
      reason: reason ? escapeHtml(reason) : undefined,
      trackingUrl,
    })
  } catch { /* non-blocking */ }

  return NextResponse.json({ success: true })
}
