// web/src/app/api/work-orders/[id]/mention/route.ts
//
// WO-34 / 1C-24: emit the wo_i_mentioned notification to users @-mentioned in a
// work-order comment. Client posts the comment via supabase, then calls this with
// the picked user ids. Recipients are re-verified server-side to be same-org +
// active before anything is sent (the client list is never trusted for scope).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NotificationService } from '@/lib/NotificationService'
import { notifyWOMention } from '@/lib/notifications/workOrderNotifications'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing work order id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id, full_name')
    .eq('id', user.id)
    .single()
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { comment?: string; user_ids?: string[] }
  const comment = typeof body.comment === 'string' ? body.comment : ''
  const rawIds = Array.isArray(body.user_ids) ? body.user_ids : []
  // Dedupe, drop the author (no self-mention notification).
  const ids = rawIds.filter((uid, i) => uid && uid !== user.id && rawIds.indexOf(uid) === i)
  if (ids.length === 0) return NextResponse.json({ success: true, notified: 0 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: wo } = await admin
    .from('work_orders')
    .select('id, organisation_id, wo_number, title')
    .eq('id', id)
    .maybeSingle()
  if (!wo || wo.organisation_id !== profile.organisation_id) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  // Re-scope recipients to same-org active users (never trust the client list).
  const { data: recipients } = await admin
    .from('users')
    .select('id, email')
    .in('id', ids)
    .eq('organisation_id', profile.organisation_id)
    .eq('is_active', true)

  const woNumber = wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : String(id).slice(0, 8)
  const link = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/dashboard/work-orders/${id}`
  const mentionedBy = profile.full_name || 'A teammate'

  let notified = 0
  for (const r of (recipients ?? []) as { id: string; email: string | null }[]) {
    // Bell feed row (wo_i_mentioned) + email/push via the existing emitter.
    await NotificationService.insertInApp(r.id, profile.organisation_id, 'wo_i_mentioned', {
      title: `${mentionedBy} mentioned you in ${woNumber}`,
      body: comment.slice(0, 200),
      link,
    })
    if (r.email) {
      await notifyWOMention(r.id, r.email, mentionedBy, woNumber, wo.title ?? '', String(id), comment).catch(() => {})
    }
    notified++
  }

  return NextResponse.json({ success: true, notified })
}
