import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { captureAndAlert } from '@/lib/errorLog'

const ROUTE = '/api/cron/inspection-generate'

export const runtime = 'nodejs'
export const maxDuration = 60

// Daily cron (CORE-26): for each active inspection schedule whose next_due_at
// falls within the next 24h, create a WO of source 'inspection' pointing the
// assignee at the template (the WO description links to the pre-filled run
// page), then roll next_due_at forward one cycle. Schedules with a non-empty
// `rotation` list (ordered space ids — hotel room rotation) target
// rotation[rotation_index] and advance the index, so every space is visited
// before the list repeats.
//
// Vercel: wired via vercel.json -> { path: '/api/cron/inspection-generate', schedule: '0 6 * * *' }
// Auth: requires `Authorization: Bearer ${CRON_SECRET}` — no unauthenticated path.
// Requires docs/superpowers/sql/b7-inspection-schedules.sql; fails closed with
// a clear error (and platform alert) if the table is absent.

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

type ScheduleRow = {
  id: string
  organisation_id: string
  template_id: string
  site_id: string | null
  space_id: string | null
  frequency: string
  interval_days: number | null
  next_due_at: string
  assigned_to: string | null
  rotation: unknown
  rotation_index: number | null
  is_active: boolean
  template: { name: string } | null
}

async function run() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const now = new Date()
  const { data: due, error } = await admin
    .from('inspection_schedules')
    .select('id, organisation_id, template_id, site_id, space_id, frequency, interval_days, next_due_at, assigned_to, rotation, rotation_index, is_active, template:template_id(name)')
    .eq('is_active', true)
    .lte('next_due_at', addDays(now, 1).toISOString())
    .returns<ScheduleRow[]>()
  if (error) return { error: error.message, generated: 0 }
  if (!due || due.length === 0) return { error: null, generated: 0, scanned: 0 }

  let generated = 0
  const errors: string[] = []

  for (const sched of due) {
    try {
      // De-dupe: a WO already generated for this cycle (due on/after next_due_at).
      const { data: existing } = await admin
        .from('work_orders')
        .select('id')
        .eq('inspection_schedule_id', sched.id)
        .gte('due_at', sched.next_due_at)
        .limit(1)
      if (existing && existing.length > 0) continue

      // Rotation wins over the fixed space: pick the current entry, advance the cursor.
      const rotation: string[] = Array.isArray(sched.rotation)
        ? (sched.rotation as unknown[]).filter((x): x is string => typeof x === 'string')
        : []
      const idx = rotation.length > 0 ? ((sched.rotation_index ?? 0) % rotation.length + rotation.length) % rotation.length : 0
      const spaceId = rotation.length > 0 ? rotation[idx] : sched.space_id

      const templateName = sched.template?.name ?? 'Inspection'
      const runUrl = `/dashboard/inspections/new?template=${sched.template_id}`
        + (sched.site_id ? `&site=${sched.site_id}` : '')
        + (spaceId ? `&space=${spaceId}` : '')

      const { error: insErr } = await admin.from('work_orders').insert({
        organisation_id: sched.organisation_id,
        title: `Inspection - ${templateName}`,
        description: `Scheduled inspection using template "${templateName}". Run it at: ${runUrl}`,
        priority: 'medium',
        status: sched.assigned_to ? 'assigned' : 'new',
        source: 'inspection',
        inspection_schedule_id: sched.id,
        site_id: sched.site_id,
        space_id: spaceId,
        assigned_to: sched.assigned_to,
        due_at: sched.next_due_at,
      })
      if (insErr) {
        errors.push(`Schedule ${sched.id}: ${insErr.message}`)
        continue
      }

      // Roll next_due_at forward one interval; catch up past-due cycles so a
      // stalled cron doesn't burst-generate on recovery.
      const step = sched.frequency === 'custom'
        ? (sched.interval_days && sched.interval_days > 0 ? sched.interval_days : 30)
        : FREQ_TO_DAYS[sched.frequency] ?? 30
      let nextDue = addDays(new Date(sched.next_due_at), step)
      while (nextDue <= now) nextDue = addDays(nextDue, step)

      const update: Record<string, unknown> = { next_due_at: nextDue.toISOString() }
      if (rotation.length > 0) update.rotation_index = (idx + 1) % rotation.length
      await admin.from('inspection_schedules').update(update).eq('id', sched.id)
      generated++
    } catch (e) {
      errors.push(`Schedule ${sched.id} threw: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { error: errors.length > 0 ? errors.join('; ') : null, generated, scanned: due.length }
}

export async function GET(req: NextRequest) {
  // CRON_SECRET is mandatory — fail closed if it isn't configured.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
