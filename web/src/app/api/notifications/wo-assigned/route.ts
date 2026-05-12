import { NextRequest, NextResponse } from 'next/server'
import { notifyWOAssigned } from '@/lib/notifications/workOrderNotifications'

export async function POST(req: NextRequest) {
  try {
    const { userId, userEmail, assignedBy, woNumber, woTitle, woId } = await req.json()

    if (!userId || !userEmail || !woNumber || !woTitle || !woId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    await notifyWOAssigned(userId, userEmail, assignedBy || 'Manager', woNumber, woTitle, woId)

    return NextResponse.json({ success: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('[wo-assigned notify]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
