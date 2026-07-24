// AG-13 — Asset Log condition review-due reminders. Runs weekly.
// Notifies org admins/managers when an item's condition review is due
// (last_condition_review_at + condition_review_interval_months has passed, or a
// cadence is set and no review has ever been logged).
//
// Deduped per (item, cycle, user) via NotificationService dedupeKey: the key
// carries the cycle's due-date, so re-runs stay silent but a fresh cycle
// (after a review is logged, which moves last_condition_review_at forward)
// notifies again. Mirrors /api/cron/asset-warranty.
//
// Auth: requires Authorization: Bearer ${CRON_SECRET}, fails closed if unset.
// Wired in vercel.json -> crons.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { NotificationService } from '@/lib/NotificationService'
import { captureAndAlert } from '@/lib/errorLog'
import { isReviewDue } from '@/lib/asset-log'

const ROUTE = '/api/cron/asset-review-due'

export const runtime = 'nodejs'
export const maxDuration = 60

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'

type ItemRow = {
  id: string
  organisation_id: string
  item_number: number
  name: string
  last_condition_review_at: string | null
  condition_review_interval_months: number | null
}

// The current cycle's due date (last review + interval months), or 'initial'
// when no review has ever been logged. Used to namespace the dedupe key so each
// cycle notifies once.
function cycleKey(item: ItemRow): string {
  if (!item.last_condition_review_at) return 'initial'
  const due = new Date(item.last_condition_review_at)
  due.setMonth(due.getMonth() + (item.condition_review_interval_months ?? 0))
  return due.toISOString().slice(0, 10)
}

async function run() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let notified = 0
  const errors: string[] = []
  const recipientsByOrg = new Map<string, { id: string }[]>()

  async function orgRecipients(orgId: string): Promise<{ id: string }[]> {
    const cached = recipientsByOrg.get(orgId)
    if (cached) return cached
    const { data } = await admin
      .from('users')
      .select('id')
      .eq('organisation_id', orgId)
      .in('role', ['admin', 'manager'])
      .eq('is_active', true)
    const rows = (data as { id: string }[]) ?? []
    recipientsByOrg.set(orgId, rows)
    return rows
  }

  async function notify(orgId: string, key: string, title: string, body: string, link: string) {
    for (const a of await orgRecipients(orgId)) {
      if (await NotificationService.insertInApp(a.id, orgId, 'daily_summary_ready', {
        title, body, link, dedupeKey: `${key}:${a.id}`,
      })) notified++
    }
  }

  try {
    // Candidates: a cadence is set and the item is still live. Due-date math
    // depends on the per-row interval, so we filter in JS via isReviewDue.
    const { data: rows } = await admin
      .from('asset_log_items')
      .select('id, organisation_id, item_number, name, last_condition_review_at, condition_review_interval_months')
      .neq('status', 'disposed')
      .gt('condition_review_interval_months', 0)
      .returns<ItemRow[]>()

    const title = 'Condition review due'
    for (const it of rows ?? []) {
      if (!isReviewDue(it)) continue
      const al = 'AL-' + String(it.item_number).padStart(4, '0')
      await notify(it.organisation_id, `asset_review_due:${it.id}:${cycleKey(it)}`, title,
        `${al} ${it.name} — condition review is due`,
        `${APP_URL}/dashboard/asset-log/${it.id}`)
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  return { error: errors.length > 0 ? errors.join('; ') : null, notified }
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
