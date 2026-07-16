// AG-11 — Asset Log warranty-expiry cron. Runs weekly.
// Notifies org admins of non-disposed asset_log_items whose warranty_expiry falls
// in exactly 30 or 7 days. Deduped per (item, window, user) via NotificationService
// dedupeKey, so re-runs never re-notify — mirrors /api/cron/compliance-expiry.
//
// Auth: requires Authorization: Bearer ${CRON_SECRET}, fails closed if unset.
// Wired in vercel.json -> crons.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { NotificationService } from '@/lib/NotificationService'
import { captureAndAlert } from '@/lib/errorLog'

const ROUTE = '/api/cron/asset-warranty'

export const runtime = 'nodejs'
export const maxDuration = 60

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'
const WINDOWS = [30, 7] as const

type ItemRow = {
  id: string
  organisation_id: string
  item_number: number
  name: string
  warranty_expiry: string // DATE
}

// YYYY-MM-DD for `days` from today (UTC), matching the DATE column.
function isoDate(days: number): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function run() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let notified = 0
  const errors: string[] = []
  const adminsByOrg = new Map<string, { id: string }[]>()

  async function orgAdmins(orgId: string): Promise<{ id: string }[]> {
    const cached = adminsByOrg.get(orgId)
    if (cached) return cached
    const { data } = await admin
      .from('users')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('role', 'admin')
      .eq('is_active', true)
    const rows = (data as { id: string }[]) ?? []
    adminsByOrg.set(orgId, rows)
    return rows
  }

  for (const days of WINDOWS) {
    try {
      const target = isoDate(days)
      const { data: rows } = await admin
        .from('asset_log_items')
        .select('id, organisation_id, item_number, name, warranty_expiry')
        .neq('status', 'disposed')
        .eq('warranty_expiry', target)
        .returns<ItemRow[]>()

      for (const it of rows ?? []) {
        const al = 'AL-' + String(it.item_number).padStart(4, '0')
        const link = `${APP_URL}/dashboard/asset-log/${it.id}`
        const title = `Warranty expiring in ${days} days`
        const body = `${al} ${it.name} — warranty expires ${it.warranty_expiry}`
        // dedupe per item + window; the expiry date is fixed so re-runs are silent.
        const key = `asset_warranty:${it.id}:${days}`
        for (const a of await orgAdmins(it.organisation_id)) {
          if (await NotificationService.insertInApp(a.id, it.organisation_id, 'daily_summary_ready', {
            title, body, link, dedupeKey: `${key}:${a.id}`,
          })) notified++
        }
      }
    } catch (e) {
      errors.push(`${days}d: ${e instanceof Error ? e.message : String(e)}`)
    }
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
