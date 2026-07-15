import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NotificationService } from '@/lib/NotificationService'
import type { NotificationTypeKey } from '@/lib/notificationTypes'
import { escapeHtml } from '@/lib/escapeHtml'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
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

    const { userId, userEmail, woNumber, woTitle, woId, newStatus } = await req.json()

    if (!userId || !userEmail || !woNumber || !woTitle || !woId || !newStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // The recipient must belong to the caller's organisation. Use the email
    // stored on the profile rather than trusting the body's userEmail.
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: target } = await admin
      .from('users')
      .select('organisation_id, email, is_active, disabled')
      .eq('id', userId)
      .maybeSingle()
    if (!target || target.organisation_id !== callerProfile.organisation_id || !target.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    // 1C-07: a deactivated/disabled account receives no notification.
    if (target.is_active === false || target.disabled === true) {
      return NextResponse.json({ success: true, skipped: 'inactive' })
    }

    const statusLabels: Record<string, string> = {
      assigned:    'Assigned',
      in_progress: 'In Progress',
      on_hold:     'On Hold',
      completed:   'Completed',
      closed:      'Closed',
      activity:    'New Activity Logged',
      comment:     'New Comment',
    }
    const label = statusLabels[newStatus] ?? newStatus
    const isActivity = newStatus === 'activity'
    const isComment = newStatus === 'comment'
    const isEvent = isActivity || isComment

    // Escaped copies of all user-supplied values interpolated into the HTML email.
    const safeWoNumber = escapeHtml(woNumber)
    const safeWoTitle  = escapeHtml(woTitle)
    const safeLabel    = escapeHtml(label)
    const safeWoId     = encodeURIComponent(String(woId))

    await NotificationService.notify(userId, 'wo_i_assigned_updated' as NotificationTypeKey, {
      email: target.email,
      subject: isEvent ? `${label} on ${woNumber}` : `Work Order ${woNumber} — ${label}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>${isComment ? 'New Comment on Work Order' : isActivity ? 'Activity Logged on Work Order' : 'Work Order Status Updated'}</h2>
          <p>${isComment
            ? `A new comment has been added to work order <strong>${safeWoNumber}</strong>.`
            : isActivity
              ? `A technician has logged new activity on work order <strong>${safeWoNumber}</strong>.`
              : `Work order <strong>${safeWoNumber}</strong> status has changed to <strong>${safeLabel}</strong>.`
          }</p>
          <p><strong>Title:</strong> ${safeWoTitle}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/work-orders/${safeWoId}">View Work Order</a></p>
        </div>
      `,
      pushTitle: isEvent ? `${woNumber}: ${label}` : `${woNumber} — ${label}`,
      pushBody: woTitle,
      pushData: { woId, woNumber, status: newStatus },
    })

    return NextResponse.json({ success: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('[wo-status notify]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
