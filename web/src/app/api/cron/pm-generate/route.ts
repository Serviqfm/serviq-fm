import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isMonthInSeasonalWindow, nextSeasonStart, rollByInterval, type Recurrence } from '@/app/dashboard/pm-schedules/pm-utils'
import { captureAndAlert } from '@/lib/errorLog'

const ROUTE = '/api/cron/pm-generate'

export const runtime = 'nodejs'
export const maxDuration = 60

// Hourly cron: find active PM schedules whose next_due_at is within the next
// `lead_time` hours and have not generated a WO for this cycle yet. Create a WO
// per due PM, roll next_due_at forward by frequency, and stamp last_completed_at
// audit field (left for the technician to complete the WO).
//
// Vercel: wire via vercel.json -> crons: [{ path: '/api/cron/pm-generate', schedule: '0 * * * *' }]
// Auth: requires `Authorization: Bearer ${CRON_SECRET}` — no unauthenticated path.

const FREQ_TO_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  fortnightly: 14,
  monthly: 30,
  quarterly: 90,
  biannual: 180,
  annual: 365,
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

// From `from`, advance day-by-day (max 8 iterations) to the next date whose
// UTC weekday is in daysOfWeek (0=Sun .. 6=Sat). Falls back to +7 days.
// Keep in sync with src/app/dashboard/pm-schedules/pm-utils.ts.
function nextDueOnDaysOfWeek(from: Date, daysOfWeek: number[]): Date {
  let next = addDays(from, 1)
  for (let i = 0; i < 8; i++) {
    if (daysOfWeek.includes(next.getUTCDay())) return next
    next = addDays(next, 1)
  }
  return addDays(from, 7)
}

type PMRow = {
  id: string
  title: string
  description: string | null
  frequency: string
  asset_id: string | null
  site_id: string | null
  assigned_to: string | null
  estimated_duration_minutes: number | null
  organisation_id: string
  next_due_at: string | null
  lead_time_days?: number | null
  is_archived?: boolean | null
  end_date?: string | null
  days_of_week?: number[] | null
  is_seasonal?: boolean | null
  seasonal_start_month?: number | null
  seasonal_end_month?: number | null
  meter_id?: string | null
  meter_interval?: number | null
  last_trigger_reading?: number | null
  scheduling_mode?: string | null   // 'fixed' | 'floating' (1C-09)
  interval_count?: number | null     // 1C-10 recurrence config
  interval_unit?: string | null
  anchor_day?: number | null
}

// Roll next_due_at forward one cycle. Precedence: explicit interval config
// (1C-10) → weekly days_of_week → fixed FREQ_TO_DAYS preset. `from` is the base
// date to advance from (last due date for fixed, completed_at for floating).
function rollForward(from: Date, pm: PMRow): Date {
  const rec: Recurrence = { interval_count: pm.interval_count, interval_unit: pm.interval_unit, anchor_day: pm.anchor_day }
  const byInterval = rollByInterval(from, rec)
  if (byInterval) return byInterval
  if (pm.frequency === 'weekly' && pm.days_of_week && pm.days_of_week.length > 0) {
    return nextDueOnDaysOfWeek(from, pm.days_of_week)
  }
  return addDays(from, FREQ_TO_DAYS[pm.frequency] ?? 30)
}

async function run() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const now = new Date()
  // Fetch schedules due within a wide window; each schedule's exact lead time is
  // applied per row below (DV-11). 400 days covers annual lead times.
  const cutoff = addDays(now, 400).toISOString()

  const { data: due, error } = await admin
    .from('pm_schedules')
    .select('id, title, description, frequency, asset_id, site_id, assigned_to, estimated_duration_minutes, organisation_id, next_due_at, lead_time_days, is_archived, end_date, days_of_week, is_seasonal, seasonal_start_month, seasonal_end_month, meter_id, meter_interval, last_trigger_reading, scheduling_mode, interval_count, interval_unit, anchor_day')
    .eq('is_active', true)
    .eq('is_archived', false)
    .not('next_due_at', 'is', null)
    .lte('next_due_at', cutoff)
    .returns<PMRow[]>()
  if (error) return { error: error.message, generated: 0 }
  // Meter-triggered schedules can fire with no calendar due date, so they aren't
  // caught by the next_due_at window above — evaluate them in a separate pass.
  const meterGenerated = await runMeterPass(admin)
  if (!due || due.length === 0) return { error: null, generated: meterGenerated, scanned: 0 }

  let generated = 0
  const errors: string[] = []

  for (const pm of due) {
    try {
      // Belt-and-braces: never generate for archived schedules.
      if (pm.is_archived) continue

      // End date reached: don't generate past it — deactivate the schedule instead.
      if (pm.end_date && new Date(pm.next_due_at!) > new Date(pm.end_date)) {
        await admin.from('pm_schedules').update({ is_active: false }).eq('id', pm.id)
        continue
      }

      // DV-11: only generate once we're within THIS schedule's lead window (default 2d).
      // Floating schedules time off the prior WO's completion (checked below), so the
      // stored next_due_at is only an estimate — don't let it gate them here.
      const isFloating = pm.scheduling_mode === 'floating'
      const lead = pm.lead_time_days ?? 2
      if (!isFloating && new Date(pm.next_due_at!) > addDays(now, lead)) continue

      // 1C-04: if the due date falls in the seasonal inactive window, generate nothing
      // and roll next_due_at to the start of the next active season.
      if (pm.is_seasonal && pm.seasonal_start_month && pm.seasonal_end_month) {
        const dueMonth = new Date(pm.next_due_at!).getUTCMonth() + 1
        if (!isMonthInSeasonalWindow(dueMonth, pm.seasonal_start_month, pm.seasonal_end_month)) {
          const resume = nextSeasonStart(new Date(pm.next_due_at!), pm.seasonal_start_month)
          const upd: Record<string, unknown> = { next_due_at: resume.toISOString() }
          if (pm.end_date && resume > new Date(pm.end_date)) upd.is_active = false
          await admin.from('pm_schedules').update(upd).eq('id', pm.id)
          continue
        }
      }

      // 1C-09 floating (after-completion): the next WO is due `interval` after the
      // PREVIOUS one was completed, not on a fixed calendar. So we (a) never generate
      // while any prior WO for this schedule is still open, and (b) anchor the roll off
      // the last WO's completed_at. The first WO is created normally (no prior WO exists).
      let floatingCompletedAt: Date | null = null
      if (isFloating) {
        const { data: last } = await admin
          .from('work_orders')
          .select('status, completed_at')
          .eq('pm_schedule_id', pm.id)
          .order('created_at', { ascending: false })
          .limit(1)
        const prev = last?.[0]
        if (prev) {
          // A prior WO exists: only roll once it's done. Open (not completed/closed) → wait.
          if (!['completed', 'closed'].includes(prev.status)) continue
          if (!prev.completed_at) continue
          floatingCompletedAt = new Date(prev.completed_at)
          // Not yet an interval past completion → not due.
          const dueAfter = rollForward(floatingCompletedAt, pm)
          if (dueAfter > now) continue
        }
        // No prior WO → fall through and create the first one immediately.
      }

      // Fixed schedules: skip if a WO already exists for this cycle (due date match).
      if (!isFloating) {
        const { data: existing } = await admin
          .from('work_orders')
          .select('id')
          .eq('pm_schedule_id', pm.id)
          .gte('due_at', pm.next_due_at!)
          .limit(1)
        if (existing && existing.length > 0) continue
      }

      // Floating WOs generated after a completion are due one interval past that
      // completion (floatingCompletedAt + interval); the first floating WO and all
      // fixed WOs are due on the schedule's next_due_at.
      const woDueAt = (isFloating && floatingCompletedAt)
        ? rollForward(floatingCompletedAt, pm).toISOString()
        : pm.next_due_at

      // Insert the WO. Skip is_recurring/recurrence_frequency since those
      // columns aren't reliably present across all Supabase projects; the
      // recurrence is captured by pm_schedule_id alone.
      const { error: insErr } = await admin.from('work_orders').insert({
        organisation_id: pm.organisation_id,
        title: `PM - ${pm.title}`,
        description: pm.description,
        priority: 'medium',
        status: pm.assigned_to ? 'assigned' : 'new',
        source: 'pm_schedule',
        pm_schedule_id: pm.id,
        asset_id: pm.asset_id,
        site_id: pm.site_id,
        assigned_to: pm.assigned_to,
        due_at: woDueAt,
        sla_hours: pm.estimated_duration_minutes ? Math.ceil(pm.estimated_duration_minutes / 60) : null,
      })
      if (insErr) {
        errors.push(`PM ${pm.id}: ${insErr.message}`)
        continue
      }

      // Roll next_due_at forward. Floating anchors off this WO's completion
      // (completed_at + interval; now + interval for the first WO). Fixed rolls off
      // the prior due date. Both honor the 1C-10 interval config via rollForward.
      const baseDue = isFloating ? (floatingCompletedAt ?? now) : new Date(pm.next_due_at!)
      let nextDueDate = rollForward(baseDue, pm)
      // If the rolled date lands in the seasonal inactive window, jump to next season.
      if (pm.is_seasonal && pm.seasonal_start_month && pm.seasonal_end_month
          && !isMonthInSeasonalWindow(nextDueDate.getUTCMonth() + 1, pm.seasonal_start_month, pm.seasonal_end_month)) {
        nextDueDate = nextSeasonStart(nextDueDate, pm.seasonal_start_month)
      }
      const update: Record<string, unknown> = { next_due_at: nextDueDate.toISOString() }
      // Rolled past the end date: this was the last cycle — deactivate.
      if (pm.end_date && nextDueDate > new Date(pm.end_date)) update.is_active = false
      // Hybrid: a calendar service also consumes the current meter crossing, so the meter
      // pass won't generate a duplicate WO for the same cycle after this one completes.
      if (pm.meter_id) {
        const { data: m } = await admin.from('meters').select('current_reading').eq('id', pm.meter_id).single()
        if (m) update.last_trigger_reading = Number(m.current_reading)
      }
      await admin.from('pm_schedules').update(update).eq('id', pm.id)
      generated++
    } catch (e) {
      errors.push(`PM ${pm.id} threw: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { error: errors.length > 0 ? errors.join('; ') : null, generated: generated + meterGenerated, scanned: due.length }
}

// Meter arm of the hybrid trigger (T8 / 1C-11). For each active meter-based schedule,
// generate a WO when the linked meter's current_reading has crossed
// (last_trigger_reading + meter_interval), then advance last_trigger_reading. A schedule
// with BOTH next_due_at and meter_id is hybrid: the calendar loop above and this pass
// each fire on their own condition (whichever comes first); the WO-exists de-dupe stops
// a double WO in the same cycle. Mirrors generate_due_pm_work_orders() in
// docs/superpowers/sql/t8-01-meters-pm.sql.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runMeterPass(admin: any): Promise<number> {
  const { data: rows } = await admin
    .from('pm_schedules')
    .select('id, title, description, asset_id, site_id, assigned_to, estimated_duration_minutes, organisation_id, next_due_at, meter_id, meter_interval, last_trigger_reading')
    .eq('is_active', true)
    .eq('is_archived', false)
    .not('meter_id', 'is', null)
    .not('meter_interval', 'is', null)
  if (!rows || rows.length === 0) return 0
  const pmRows = rows as PMRow[]

  let generated = 0
  for (const pm of pmRows) {
    try {
      if (!pm.meter_id || !pm.meter_interval || pm.meter_interval <= 0) continue
      const { data: meter } = await admin
        .from('meters')
        .select('current_reading')
        .eq('id', pm.meter_id)
        .single()
      if (!meter) continue
      const reading = Number(meter.current_reading)
      const threshold = (pm.last_trigger_reading ?? 0) + pm.meter_interval
      if (reading < threshold) continue

      // De-dupe: at most one open PM WO per schedule. Do NOT advance the marker on a
      // skip — if the open WO is calendar-sourced, advancing here swallows this crossing.
      const { data: existing } = await admin
        .from('work_orders')
        .select('id')
        .eq('pm_schedule_id', pm.id)
        .not('status', 'in', '("completed","closed")')
        .limit(1)
      if (existing && existing.length > 0) continue

      const { error: insErr } = await admin.from('work_orders').insert({
        organisation_id: pm.organisation_id,
        title: `PM - ${pm.title}`,
        description: pm.description,
        priority: 'medium',
        status: pm.assigned_to ? 'assigned' : 'new',
        source: 'pm_schedule',
        pm_schedule_id: pm.id,
        asset_id: pm.asset_id,
        site_id: pm.site_id,
        assigned_to: pm.assigned_to,
        due_at: pm.next_due_at,
        sla_hours: pm.estimated_duration_minutes ? Math.ceil(pm.estimated_duration_minutes / 60) : null,
      })
      if (insErr) continue
      await admin.from('pm_schedules').update({ last_trigger_reading: reading }).eq('id', pm.id)
      generated++
    } catch {
      // Isolate a single bad schedule; keep processing the rest.
    }
  }
  return generated
}

export async function GET(req: NextRequest) {
  // CRON_SECRET is mandatory — fail closed if it isn't configured rather than
  // running open. (Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`
  // automatically when the env var is set.)
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
