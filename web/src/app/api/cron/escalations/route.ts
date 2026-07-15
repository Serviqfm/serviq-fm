import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { NotificationService } from '@/lib/NotificationService'
import { captureAndAlert } from '@/lib/errorLog'

const ROUTE = '/api/cron/escalations'

export const runtime = 'nodejs'
export const maxDuration = 60

// CORE-16 — Escalation cron. Runs hourly. Writes in-app alert-center rows
// (user_notifications) for three escalations, each deduped so re-runs never
// re-notify (partial unique index on (user_id, dedupe_key)):
//   (a) SLA/overdue: a non-terminal WO past its due_at  -> assignee + org managers.
//   (b) PM overdue 24h: a PM-sourced WO still not started 24h past due_at -> managers.
//   (c) due soon: a non-terminal WO due within the next 24h -> assignee.
// Deactivated users (is_active = false) are excluded from every fan-out (1C-07).
//
// Vercel: wired via vercel.json -> crons [{ path: '/api/cron/escalations', schedule: '0 * * * *' }].
// Auth: mirrors /api/cron/pm-generate exactly — requires Authorization: Bearer ${CRON_SECRET},
// fails closed if CRON_SECRET is unset. No unauthenticated path.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'
const TERMINAL = '("completed","closed")'

type WORow = {
  id: string
  organisation_id: string
  title: string
  wo_number: number | null
  status: string
  due_at: string | null
  assigned_to: string | null
  additional_workers: string[] | null
  pm_schedule_id: string | null
}

function woLabel(wo: WORow): string {
  return wo.wo_number ? `WO-${wo.wo_number}` : wo.title
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function activeManagers(admin: any, orgId: string): Promise<{ id: string }[]> {
  const { data } = await admin
    .from('users')
    .select('id')
    .eq('organisation_id', orgId)
    .in('role', ['admin', 'manager'])
    .eq('is_active', true)
  return (data as { id: string }[]) ?? []
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isActive(admin: any, userId: string): Promise<boolean> {
  const { data } = await admin.from('users').select('is_active').eq('id', userId).maybeSingle()
  return !!data && (data as { is_active: boolean }).is_active === true
}

async function run() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const now = new Date()
  const nowISO = now.toISOString()
  const in24h = new Date(now.getTime() + 24 * 3600 * 1000).toISOString()
  const past24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()

  let overdue = 0
  let pmEscalated = 0
  let dueSoon = 0
  const errors: string[] = []

  // ── (a) Overdue: non-terminal WOs past due_at ────────────────────────────────
  try {
    const { data: rows } = await admin
      .from('work_orders')
      .select('id, organisation_id, title, wo_number, status, due_at, assigned_to, additional_workers, pm_schedule_id')
      .not('due_at', 'is', null)
      .lt('due_at', nowISO)
      .not('status', 'in', TERMINAL)
      .returns<WORow[]>()

    for (const wo of rows ?? []) {
      const link = `${APP_URL}/dashboard/work-orders/${wo.id}`
      const title = `${woLabel(wo)} is overdue`
      const body = wo.title
      // one dedupe key per WO+due date: re-runs are silent, a new due date re-alerts.
      const key = `wo_overdue:${wo.id}:${wo.due_at}`

      // Assignee (skip if deactivated).
      if (wo.assigned_to && (await isActive(admin, wo.assigned_to))) {
        if (await NotificationService.insertInApp(wo.assigned_to, wo.organisation_id, 'wo_i_assigned_updated', {
          title, body, link, dedupeKey: `${key}:assignee`,
        })) overdue++
      }
      // Org managers.
      for (const m of await activeManagers(admin, wo.organisation_id)) {
        if (m.id === wo.assigned_to) continue
        if (await NotificationService.insertInApp(m.id, wo.organisation_id, 'wo_i_assigned_updated', {
          title, body, link, dedupeKey: `${key}:mgr:${m.id}`,
        })) overdue++
      }
    }
  } catch (e) {
    errors.push(`overdue: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── (b) PM overdue 24h: PM WO not started, 24h+ past due ─────────────────────
  try {
    const { data: rows } = await admin
      .from('work_orders')
      .select('id, organisation_id, title, wo_number, status, due_at, assigned_to, additional_workers, pm_schedule_id')
      .not('pm_schedule_id', 'is', null)
      .not('due_at', 'is', null)
      .lt('due_at', past24h)
      .in('status', ['new', 'assigned'])
      .returns<WORow[]>()

    for (const wo of rows ?? []) {
      const link = `${APP_URL}/dashboard/work-orders/${wo.id}`
      const title = `PM ${woLabel(wo)} not started`
      const body = `${wo.title} — 24h+ past due, still not started`
      const key = `pm_escalation:${wo.id}:${wo.due_at}`
      for (const m of await activeManagers(admin, wo.organisation_id)) {
        if (await NotificationService.insertInApp(m.id, wo.organisation_id, 'wo_i_assigned_updated', {
          title, body, link, dedupeKey: `${key}:mgr:${m.id}`,
        })) pmEscalated++
      }
    }
  } catch (e) {
    errors.push(`pm_escalation: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── (c) Due soon: non-terminal WOs due within the next 24h -> assignee ────────
  try {
    const { data: rows } = await admin
      .from('work_orders')
      .select('id, organisation_id, title, wo_number, status, due_at, assigned_to, additional_workers, pm_schedule_id')
      .not('due_at', 'is', null)
      .gte('due_at', nowISO)
      .lte('due_at', in24h)
      .not('status', 'in', TERMINAL)
      .returns<WORow[]>()

    for (const wo of rows ?? []) {
      if (!wo.assigned_to) continue
      if (!(await isActive(admin, wo.assigned_to))) continue
      const link = `${APP_URL}/dashboard/work-orders/${wo.id}`
      if (await NotificationService.insertInApp(wo.assigned_to, wo.organisation_id, 'wo_i_assigned_updated', {
        title: `${woLabel(wo)} due soon`,
        body: `${wo.title} — due within 24 hours`,
        link,
        dedupeKey: `wo_due_soon:${wo.id}:${wo.due_at}`,
      })) dueSoon++
    }
  } catch (e) {
    errors.push(`due_soon: ${e instanceof Error ? e.message : String(e)}`)
  }

  return {
    error: errors.length > 0 ? errors.join('; ') : null,
    overdue, pmEscalated, dueSoon,
  }
}

export async function GET(req: NextRequest) {
  // CRON_SECRET is mandatory — fail closed if unset rather than running open.
  // (Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` automatically.)
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // DV-16: a failing run must not fail silently. Log + alert platform admins on
  // an unexpected throw or when run() reports accumulated errors.
  try {
    const result = await run()
    if (result.error) {
      await captureAndAlert(new Error(result.error), { route: ROUTE })
    }
    return NextResponse.json(result)
  } catch (e) {
    await captureAndAlert(e, { route: ROUTE })
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
