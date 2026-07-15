import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { notifyWOAssigned, notifyWOTeamAssigned, notifyWOAdditionalWorker } from '@/lib/notifications/workOrderNotifications'
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

    const body = await req.json()
    const { userId, assignedBy, woNumber, woTitle, woId } = body
    // 1C-06/WO-28: optional team + additional-worker fan-out. Members are resolved
    // server-side (never trusted from the body) so notifications can't be spoofed.
    const teamId: string | undefined = typeof body.teamId === 'string' && body.teamId ? body.teamId : undefined
    const additionalWorkerIds: string[] = Array.isArray(body.additionalWorkerIds)
      ? body.additionalWorkerIds.filter((x: unknown): x is string => typeof x === 'string' && !!x)
      : []

    if (!woNumber || !woTitle || !woId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!userId && !teamId && additionalWorkerIds.length === 0) {
      return NextResponse.json({ error: 'No recipients' }, { status: 400 })
    }

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const orgId = callerProfile.organisation_id

    // Escaped copies — every value below is interpolated into email HTML.
    const safeAssignedBy = escapeHtml(assignedBy || 'Manager')
    const safeWoNumber = escapeHtml(woNumber)
    const safeWoTitle = escapeHtml(woTitle)
    const safeWoId = encodeURIComponent(String(woId))

    // 1C-07: shared recipient loader — org-scoped and excludes deactivated/disabled
    // accounts so no fan-out ever reaches a silenced user.
    const activeUsers = async (ids: string[]): Promise<{ id: string; email: string }[]> => {
      const unique = ids.filter((v, i) => v && ids.indexOf(v) === i)
      if (unique.length === 0) return []
      const { data } = await admin
        .from('users')
        .select('id, email, organisation_id, is_active, disabled')
        .in('id', unique)
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .neq('disabled', true)
      return (data ?? [])
        .filter((u): u is { id: string; email: string; organisation_id: string; is_active: boolean; disabled: boolean } => !!u.email)
        .map(u => ({ id: u.id, email: u.email }))
    }

    // Single assignee (existing behaviour, now active-gated).
    if (userId) {
      const [target] = await activeUsers([userId])
      if (target) {
        await notifyWOAssigned(target.id, target.email, safeAssignedBy, safeWoNumber, safeWoTitle, safeWoId)
      }
    }

    // Team fan-out: resolve members of the team within the org, active only.
    if (teamId) {
      const { data: team } = await admin
        .from('teams')
        .select('name, organisation_id')
        .eq('id', teamId)
        .eq('organisation_id', orgId)
        .maybeSingle()
      if (team) {
        const { data: members } = await admin
          .from('team_members')
          .select('user_id')
          .eq('team_id', teamId)
          .eq('organisation_id', orgId)
        const recipients = await activeUsers((members ?? []).map(m => m.user_id as string))
        if (recipients.length > 0) {
          await notifyWOTeamAssigned(
            recipients.map(r => r.id),
            recipients.map(r => r.email),
            escapeHtml(String(team.name ?? 'Team')),
            safeWoNumber,
            safeWoTitle,
            safeWoId
          )
        }
      }
    }

    // Additional workers: one notification each, active only.
    if (additionalWorkerIds.length > 0) {
      const workers = await activeUsers(additionalWorkerIds)
      await Promise.all(
        workers.map(w =>
          notifyWOAdditionalWorker(w.id, w.email, safeAssignedBy, safeWoNumber, safeWoTitle, safeWoId)
        )
      )
    }

    return NextResponse.json({ success: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('[wo-assigned notify]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
