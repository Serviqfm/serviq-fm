import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
}

async function run() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const now = new Date()
  const cutoff = addDays(now, 2).toISOString()  // generate 2 days ahead by default

  const { data: due, error } = await admin
    .from('pm_schedules')
    .select('id, title, description, frequency, asset_id, site_id, assigned_to, estimated_duration_minutes, organisation_id, next_due_at, lead_time_days, is_archived, end_date, days_of_week')
    .eq('is_active', true)
    .eq('is_archived', false)
    .not('next_due_at', 'is', null)
    .lte('next_due_at', cutoff)
    .returns<PMRow[]>()
  if (error) return { error: error.message, generated: 0 }
  if (!due || due.length === 0) return { error: null, generated: 0, scanned: 0 }

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

      // Skip if a WO already exists for this PM cycle (linked_pm_schedule_id + due date match)
      const { data: existing } = await admin
        .from('work_orders')
        .select('id')
        .eq('pm_schedule_id', pm.id)
        .gte('due_at', pm.next_due_at!)
        .limit(1)
      if (existing && existing.length > 0) continue

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
        due_at: pm.next_due_at,
        sla_hours: pm.estimated_duration_minutes ? Math.ceil(pm.estimated_duration_minutes / 60) : null,
      })
      if (insErr) {
        errors.push(`PM ${pm.id}: ${insErr.message}`)
        continue
      }

      // Roll next_due_at forward. Weekly schedules with days_of_week set land
      // on the next selected weekday instead of blindly +7 days.
      const baseDue = new Date(pm.next_due_at!)
      const nextDueDate =
        pm.frequency === 'weekly' && pm.days_of_week && pm.days_of_week.length > 0
          ? nextDueOnDaysOfWeek(baseDue, pm.days_of_week)
          : addDays(baseDue, FREQ_TO_DAYS[pm.frequency] ?? 30)
      const update: Record<string, unknown> = { next_due_at: nextDueDate.toISOString() }
      // Rolled past the end date: this was the last cycle — deactivate.
      if (pm.end_date && nextDueDate > new Date(pm.end_date)) update.is_active = false
      await admin.from('pm_schedules').update(update).eq('id', pm.id)
      generated++
    } catch (e) {
      errors.push(`PM ${pm.id} threw: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { error: errors.length > 0 ? errors.join('; ') : null, generated, scanned: due.length }
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

  const result = await run()
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  return GET(req)
}
