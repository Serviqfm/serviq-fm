import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyWOAssigned } from '@/lib/notifications/workOrderNotifications'
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

    const { userId, userEmail, assignedBy, woNumber, woTitle, woId } = await req.json()

    if (!userId || !userEmail || !woNumber || !woTitle || !woId) {
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
      .select('organisation_id, email')
      .eq('id', userId)
      .maybeSingle()
    if (!target || target.organisation_id !== callerProfile.organisation_id || !target.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Escape user-supplied values — notifyWOAssigned interpolates them into email HTML.
    await notifyWOAssigned(
      userId,
      target.email,
      escapeHtml(assignedBy || 'Manager'),
      escapeHtml(woNumber),
      escapeHtml(woTitle),
      encodeURIComponent(String(woId))
    )

    return NextResponse.json({ success: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('[wo-assigned notify]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
