import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// PDPL self-service "export my data": the SIGNED-IN user downloads THEIR OWN
// personal data as JSON. Every query is bound to auth.uid() (or their own
// email), on top of the org-scoped RLS — it can never reach another user's row.
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const uid = user.id
  const email = user.email ?? ''

  const [profile, workOrders, comments, timeLogs, requests, notifPrefs] = await Promise.all([
    supabase.from('users').select('*').eq('id', uid).single(),
    supabase.from('work_orders').select('*').or(`assigned_to.eq.${uid},created_by.eq.${uid}`),
    supabase.from('work_order_comments').select('*').eq('user_id', uid),
    supabase.from('work_order_time_logs').select('*').eq('user_id', uid),
    // Portal requests are keyed by requester_email, not a user FK.
    email ? supabase.from('requests').select('*').eq('requester_email', email) : Promise.resolve({ data: [] }),
    supabase.from('user_notification_preferences').select('*').eq('user_id', uid),
  ])

  const payload = {
    exported_at: new Date().toISOString(),
    account: { id: uid, email },
    profile: profile.data ?? null,
    work_orders: workOrders.data ?? [],
    comments: comments.data ?? [],
    time_logs: timeLogs.data ?? [],
    requests: requests.data ?? [],
    notification_preferences: notifPrefs.data ?? [],
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="my-data-${uid}.json"`,
    },
  })
}
