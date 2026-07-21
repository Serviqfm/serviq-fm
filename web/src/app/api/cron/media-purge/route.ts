// CORE-18 / PDPL — work-order media retention purge. DESTRUCTIVE, so it is NOT
// wired into vercel.json by default. The owner enables it after review by adding:
//
//   { "path": "/api/cron/media-purge", "schedule": "0 3 * * 0" }   // weekly, Sun 03:00 UTC
//
// to vercel.json -> crons. Until then it can only be triggered manually with the
// Bearer secret. Always preview first with ?dry_run=1.
//
// What it does: removes work-order-media storage objects ONLY for work orders that
// are status='closed' AND whose closed_at is older than MEDIA_RETENTION_MONTHS
// (default 6 months), then clears photo_urls from those rows. Media for open/active
// WOs is NEVER touched. Idempotent: once a row's urls are cleared, re-runs find
// nothing new. ?dry_run=1 reports what WOULD be deleted without deleting.
//
// Auth: mirrors /api/cron/compliance-expiry exactly — requires Authorization:
// Bearer ${CRON_SECRET}, fails closed if unset.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { captureAndAlert } from '@/lib/errorLog'

const ROUTE = '/api/cron/media-purge'
const BUCKET = 'work-order-media'
const PUBLIC_MARKER = `/object/public/${BUCKET}/`

export const runtime = 'nodejs'
export const maxDuration = 60

type WORow = { id: string; organisation_id: string; closed_at: string; photo_urls: string[] | null }

function retentionMonths(): number {
  const n = Number(process.env.MEDIA_RETENTION_MONTHS)
  return Number.isFinite(n) && n > 0 ? n : 6
}

// ISO timestamp for the retention cutoff: WOs closed before this are eligible.
function cutoffIso(months: number): string {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString()
}

// Derive a storage object path from a public URL (same logic as /api/files/[id]).
// Returns null for urls that don't point at this bucket.
function pathFromUrl(url: string): string | null {
  const i = url.indexOf(PUBLIC_MARKER)
  if (i === -1) return null
  const p = decodeURIComponent(url.slice(i + PUBLIC_MARKER.length))
  return p || null
}

async function run(dryRun: boolean) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const months = retentionMonths()
  const cutoff = cutoffIso(months)

  // Only closed WOs, past the retention window, that still hold media.
  const { data, error } = await admin
    .from('work_orders')
    .select('id, organisation_id, closed_at, photo_urls')
    .eq('status', 'closed')
    .not('closed_at', 'is', null)
    .lt('closed_at', cutoff)
    .not('photo_urls', 'is', null)
    .returns<WORow[]>()

  if (error) throw new Error(`query failed: ${error.message}`)

  const rows = (data ?? []).filter((w) => Array.isArray(w.photo_urls) && w.photo_urls.length > 0)

  let purgedWOs = 0
  let purgedFiles = 0
  const errors: string[] = []

  for (const wo of rows) {
    const paths = (wo.photo_urls ?? []).map(pathFromUrl).filter((p): p is string => !!p)

    if (dryRun) {
      purgedWOs++
      purgedFiles += paths.length
      continue
    }

    try {
      if (paths.length > 0) {
        const { error: rmErr } = await admin.storage.from(BUCKET).remove(paths)
        if (rmErr) throw new Error(rmErr.message)
      }
      // Clear the row so re-runs purge nothing new (idempotent).
      const { error: upErr } = await admin
        .from('work_orders')
        .update({ photo_urls: [] })
        .eq('id', wo.id)
      if (upErr) throw new Error(upErr.message)
      purgedWOs++
      purgedFiles += paths.length
    } catch (e) {
      errors.push(`wo ${wo.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const result = {
    dry_run: dryRun,
    retention_months: months,
    cutoff,
    eligible_work_orders: rows.length,
    purged_work_orders: purgedWOs,
    purged_files: purgedFiles,
    error: errors.length > 0 ? errors.join('; ') : null,
  }
  console.log(`[media-purge] ${JSON.stringify(result)}`)
  return result
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

  const dryRun = new URL(req.url).searchParams.get('dry_run') === '1'

  try {
    const result = await run(dryRun)
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
