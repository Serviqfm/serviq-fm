import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { captureAndAlert } from '@/lib/errorLog'

const ROUTE = '/api/cron/scheduled-reports'

export const runtime = 'nodejs'
export const maxDuration = 60

// MKT-08 / FM-11 — Scheduled report packs.
// Scans active scheduled_reports whose next_run_at is due, renders each one as an
// HTML table pack from the saved config (same entity/columns the builder uses),
// emails the recipients via the existing Resend path, then advances next_run_at.
// Failures are logged to notification_log (best-effort) and surfaced via
// captureAndAlert so a broken run never fails silently.
//
// Vercel: wired via vercel.json -> crons: [{ path: '/api/cron/scheduled-reports', schedule: '0 7 * * *' }]
// Auth: requires `Authorization: Bearer ${CRON_SECRET}` — fails closed.

type Freq = 'weekly' | 'monthly'

interface ScheduleRow {
  id: string
  organisation_id: string
  name: string
  recipients: string[] | null
  frequency: Freq
  config: {
    entity?: string
    columns?: string[]
    from?: string
    to?: string
    status?: string
  } | null
}

// Whitelist of queryable entities + their date field. Mirrors the builder page —
// keep in sync. Only these tables can be scheduled; anything else is skipped.
const ENTITY_DATE_FIELD: Record<string, string> = {
  work_orders: 'created_at',
  assets: 'created_at',
  pm_schedules: 'created_at',
}

function esc(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-GB')
  }
  return String(v)
}

function nextRun(freq: Freq, from: Date): string {
  if (freq === 'monthly') {
    return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)).toISOString()
  }
  return new Date(from.getTime() + 7 * 86_400_000).toISOString()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderPack(admin: any, s: ScheduleRow): Promise<string> {
  const cfg = s.config ?? {}
  const entity = cfg.entity ?? ''
  const dateField = ENTITY_DATE_FIELD[entity]
  // Only plain scalar column identifiers — reject PostgREST embed/injection syntax
  // (foo:bar(baz), *, dotted paths) so a hand-crafted config can't pull FK-embedded
  // cross-org / PII data through this service-role select.
  const columns = (Array.isArray(cfg.columns) ? cfg.columns : [])
    .filter((c): c is string => typeof c === 'string' && /^[a-z_][a-z0-9_]*$/i.test(c))
  if (!dateField || columns.length === 0) {
    return `<p style="color:#334155">This scheduled report has no valid configuration and produced no data.</p>`
  }

  const fetchCols = Array.from(new Set([dateField, 'status', ...columns])).join(', ')
  let q = admin.from(entity).select(fetchCols).eq('organisation_id', s.organisation_id).limit(1000)
  if (cfg.from) q = q.gte(dateField, cfg.from)
  if (cfg.to) q = q.lte(dateField, cfg.to + 'T23:59:59')
  if (cfg.status) q = q.eq('status', cfg.status)
  q = q.order(dateField, { ascending: false })
  const { data, error } = await q
  if (error) throw new Error(`query failed: ${error.message}`)
  const rows = (data ?? []) as Record<string, unknown>[]

  const head = columns.map(c => `<th style="text-align:left;padding:6px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#64748B">${esc(c)}</th>`).join('')
  const body = rows.map(r =>
    `<tr>${columns.map(c => `<td style="padding:6px 10px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#334155">${esc(fmt(r[c]))}</td>`).join('')}</tr>`
  ).join('')

  return `
    <p style="color:#334155;line-height:1.6">Report <strong>${esc(s.name)}</strong> — ${rows.length} row(s).</p>
    <table style="border-collapse:collapse;width:100%;margin-top:12px">
      <thead><tr>${head}</tr></thead>
      <tbody>${body || `<tr><td style="padding:10px;color:#94A3B8">No rows.</td></tr>`}</tbody>
    </table>`
}

async function run() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const now = new Date()
  const { data: due, error } = await admin
    .from('scheduled_reports')
    .select('id, organisation_id, name, recipients, frequency, config')
    .eq('is_active', true)
    .not('next_run_at', 'is', null)
    .lte('next_run_at', now.toISOString())
    .returns<ScheduleRow[]>()
  // Table may not exist yet (app must run without the migration). Treat a missing
  // relation as "nothing to do" rather than a hard failure.
  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message)) {
      return { error: null, sent: 0, scanned: 0, note: 'scheduled_reports table absent' }
    }
    return { error: error.message, sent: 0 }
  }
  if (!due || due.length === 0) return { error: null, sent: 0, scanned: 0 }

  let sent = 0
  const errors: string[] = []

  for (const s of due) {
    const recipients = (s.recipients ?? []).filter(Boolean)
    try {
      if (recipients.length === 0) {
        // Nothing to send to — still advance so it doesn't re-fire every run.
        await admin.from('scheduled_reports').update({
          next_run_at: nextRun(s.frequency, now), last_run_at: now.toISOString(),
        }).eq('id', s.id)
        continue
      }

      const bodyHtml = await renderPack(admin, s)
      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:720px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0">
    <div style="background:#0F2044;padding:20px 28px"><span style="font-size:18px;font-weight:800;color:#fff">Serviq<span style="color:#6DCFB0">FM</span></span></div>
    <div style="padding:24px 28px"><h2 style="margin:0 0 12px;font-size:18px;color:#0F2044">${esc(s.name)}</h2>${bodyHtml}</div>
    <div style="padding:14px 28px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;text-align:center">ServIQ-FM · Scheduled Report</div>
  </div>
</body></html>`

      let anyFailed = false
      for (const to of recipients) {
        const r = await sendEmail(to, `${s.name} — ServIQ-FM Report`, html)
        if (!r.success) { anyFailed = true; errors.push(`${s.id} -> ${to}: ${r.error}`) }
        await logNotification(admin, s.organisation_id, 'scheduled_report', r.success ? 'sent' : 'failed', r.error)
      }

      // Advance regardless of a single failed recipient so the schedule keeps
      // its cadence; the failure is logged + alerted.
      await admin.from('scheduled_reports').update({
        next_run_at: nextRun(s.frequency, now), last_run_at: now.toISOString(),
      }).eq('id', s.id)
      if (!anyFailed) sent++
    } catch (e) {
      errors.push(`${s.id} threw: ${e instanceof Error ? e.message : String(e)}`)
      await logNotification(admin, s.organisation_id, 'scheduled_report', 'failed', e instanceof Error ? e.message : String(e))
    }
  }

  return { error: errors.length > 0 ? errors.join('; ') : null, sent, scanned: due.length }
}

// Best-effort audit into notification_log (shape mirrors NotificationService).
// Swallows its own errors so logging never breaks the run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logNotification(admin: any, orgId: string, typeKey: string, status: string, errorMessage?: string) {
  try {
    await admin.from('notification_log').insert({
      organisation_id: orgId,
      type_key: typeKey,
      channel: 'email',
      status,
      error_message: errorMessage ?? null,
      created_at: new Date().toISOString(),
    })
  } catch {
    // notification_log may not carry organisation_id in every project — retry without it.
    try {
      await admin.from('notification_log').insert({
        type_key: typeKey, channel: 'email', status, error_message: errorMessage ?? null, created_at: new Date().toISOString(),
      })
    } catch {
      // give up silently — logging is best-effort.
    }
  }
}

export async function GET(req: NextRequest) {
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
