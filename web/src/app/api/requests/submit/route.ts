import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRequestConfirmation } from '@/lib/email'
import { escapeHtml } from '@/lib/escapeHtml'

// Public portal endpoint — intentionally unauthenticated (anonymous requesters
// submit via QR-code links). Inputs are validated against the database and
// escaped before being interpolated into notification emails.
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.json()
  const {
    organisation_id, site_id, space_id,
    requester_name, requester_email, requester_phone,
    title, description, category, photo_urls, file_urls,
  } = body

  if (!requester_name || !requester_email || !title || !description || !category) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!organisation_id) {
    return NextResponse.json({ error: 'Missing organisation' }, { status: 400 })
  }

  // Validate the site/space actually belong to the supplied organisation —
  // prevents forging cross-org rows (e.g. attaching a request to another
  // tenant's site, or spraying notifications using a mismatched org id).
  let siteName = ''
  if (site_id) {
    const { data: site } = await supabase
      .from('sites')
      .select('id, name, organisation_id')
      .eq('id', site_id)
      .maybeSingle()
    if (!site || site.organisation_id !== organisation_id) {
      return NextResponse.json({ error: 'Invalid site' }, { status: 400 })
    }
    siteName = site.name ?? ''
  }
  if (space_id) {
    const { data: space } = await supabase
      .from('spaces')
      .select('id, site_id, site:site_id(organisation_id)')
      .eq('id', space_id)
      .maybeSingle()
    const spaceOrg = space
      ? (Array.isArray(space.site)
          ? (space.site[0] as { organisation_id: string } | undefined)?.organisation_id
          : (space.site as { organisation_id: string } | null)?.organisation_id)
      : undefined
    if (!space || spaceOrg !== organisation_id || (site_id && space.site_id !== site_id)) {
      return NextResponse.json({ error: 'Invalid space' }, { status: 400 })
    }
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
      // Escape user-supplied values — lib/email interpolates these into HTML.
      name: escapeHtml(requester_name),
      siteName: escapeHtml(siteName),
      title: escapeHtml(title),
      trackingUrl,
    })
  } catch {
    // email failure should not fail the request submission
  }

  // Notify all admins and managers in the organisation about the new request
  try {
    const { data: admins } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('organisation_id', organisation_id)
      .in('role', ['admin', 'manager'])
      .eq('is_active', true)

    if (admins && admins.length > 0) {
      const { NotificationService } = await import('@/lib/NotificationService')
      const requestUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/requests/${request.id}`
      await Promise.allSettled(
        admins.map(admin =>
          NotificationService.notify(admin.id, 'wo_requested_from_portal', {
            email: admin.email,
            subject: `New Service Request: ${title}`,
            // All requester-supplied values are escaped — this HTML lands in
            // admin inboxes and must not be injectable from the public portal.
            htmlContent: `
              <div style="font-family: Arial, sans-serif; max-width: 600px;">
                <h2>New Service Request Received</h2>
                <p><strong>From:</strong> ${escapeHtml(requester_name)} (${escapeHtml(requester_email)})</p>
                <p><strong>Site:</strong> ${escapeHtml(siteName) || 'Unknown'}</p>
                <p><strong>Category:</strong> ${escapeHtml(category)}</p>
                <p><strong>Title:</strong> ${escapeHtml(title)}</p>
                <p><strong>Description:</strong> ${escapeHtml(description)}</p>
                <p><a href="${requestUrl}">Review and Approve Request</a></p>
              </div>
            `,
            pushTitle: 'New Service Request',
            pushBody: `${requester_name}: ${title}`,
            pushData: { requestId: request.id },
          })
        )
      )
    }
  } catch {
    // non-blocking — don't fail submission if admin notify fails
  }

  return NextResponse.json({ success: true, tracking_token: request.tracking_token })
}
