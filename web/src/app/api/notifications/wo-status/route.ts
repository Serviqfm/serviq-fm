import { NextRequest, NextResponse } from 'next/server'
import { NotificationService } from '@/lib/NotificationService'
import type { NotificationTypeKey } from '@/lib/notificationTypes'

export async function POST(req: NextRequest) {
  try {
    const { userId, userEmail, woNumber, woTitle, woId, newStatus } = await req.json()

    if (!userId || !userEmail || !woNumber || !woTitle || !woId || !newStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    await NotificationService.notify(userId, 'wo_i_assigned_updated' as NotificationTypeKey, {
      email: userEmail,
      subject: isEvent ? `${label} on ${woNumber}` : `Work Order ${woNumber} — ${label}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>${isComment ? 'New Comment on Work Order' : isActivity ? 'Activity Logged on Work Order' : 'Work Order Status Updated'}</h2>
          <p>${isComment
            ? `A new comment has been added to work order <strong>${woNumber}</strong>.`
            : isActivity
              ? `A technician has logged new activity on work order <strong>${woNumber}</strong>.`
              : `Work order <strong>${woNumber}</strong> status has changed to <strong>${label}</strong>.`
          }</p>
          <p><strong>Title:</strong> ${woTitle}</p>
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/work-orders/${woId}">View Work Order</a></p>
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
