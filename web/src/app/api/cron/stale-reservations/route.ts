// P11 — stale stock holds. Runs daily.
//
// A requisition sitting in pending_approval keeps its consumables reserved, so
// nobody else can draw them. Forgotten, it quietly takes stock out of
// circulation for weeks. This chases the approver whose turn it actually is,
// and the org admins so a holiday does not mean silence.
//
// Deduped per (requisition, day, user): a hold that lasts a fortnight nags once
// a day, not once per cron run, and never twice on the same day.
//
// Auth: requires Authorization: Bearer ${CRON_SECRET}, fails closed if unset.
// Wired in vercel.json -> crons.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { NotificationService } from '@/lib/NotificationService'
import { captureAndAlert } from '@/lib/errorLog'

const ROUTE = '/api/cron/stale-reservations'

export const runtime = 'nodejs'
export const maxDuration = 60

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'
// Days a requisition may hold stock before the reminders start.
const STALE_AFTER_DAYS = 3

type Row = {
  id: string
  organisation_id: string
  requisition_number: number | null
  title: string | null
  submitted_at: string | null
}

async function run() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 86_400_000).toISOString()
  const day = new Date().toISOString().slice(0, 10)
  let notified = 0
  const errors: string[] = []

  // Candidates: still awaiting approval, submitted before the cutoff.
  const { data: pending, error } = await admin
    .from('requisitions')
    .select('id, organisation_id, requisition_number, title, submitted_at')
    .eq('status', 'pending_approval')
    .lt('submitted_at', cutoff)
    .returns<Row[]>()
  if (error) return { error: error.message, notified: 0 }

  const adminsByOrg = new Map<string, string[]>()
  async function orgAdmins(orgId: string): Promise<string[]> {
    const cached = adminsByOrg.get(orgId)
    if (cached) return cached
    const { data } = await admin
      .from('users').select('id')
      .eq('organisation_id', orgId).eq('role', 'admin').eq('is_active', true)
    const ids = (data ?? []).map(u => u.id as string)
    adminsByOrg.set(orgId, ids)
    return ids
  }

  for (const req of pending ?? []) {
    try {
      // Only requisitions actually HOLDING stock are worth chasing — a purchase-
      // only requisition sitting unapproved costs nobody a box of gloves.
      const { data: held } = await admin
        .from('requisition_items')
        .select('quantity, item:item_id(name, unit)')
        .eq('requisition_id', req.id)
        .eq('line_type', 'stock')
        .not('reserved_qty', 'is', null)
      if (!held || held.length === 0) continue

      const days = req.submitted_at
        ? Math.floor((Date.now() - new Date(req.submitted_at).getTime()) / 86_400_000)
        : STALE_AFTER_DAYS
      const label = req.requisition_number ? `REQ #${req.requisition_number}` : 'A requisition'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const what = held.map(h => `${Number(h.quantity)} ${((h.item as any)?.name ?? 'item')}`).join(', ')
      const title = `${label} has been holding stock for ${days} days`
      const body = `${what} — waiting for approval. Approve, reject or cancel it to free the stock.`
      const link = `${APP_URL}/dashboard/procurement/requisitions/${req.id}`

      // The approver whose turn it is: the lowest step still pending.
      const { data: step } = await admin
        .from('requisition_approvals')
        .select('approver_user_id')
        .eq('requisition_id', req.id)
        .eq('status', 'pending')
        .order('step_order')
        .limit(1)
        .maybeSingle()

      const recipients = new Set<string>(await orgAdmins(req.organisation_id))
      if (step?.approver_user_id) recipients.add(step.approver_user_id as string)

      for (const userId of Array.from(recipients)) {
        if (await NotificationService.insertInApp(userId, req.organisation_id, 'req_pending_approval', {
          title,
          body,
          link,
          dedupeKey: `stale_reservation:${req.id}:${day}:${userId}`,
          localized: {
            ar: {
              title: `${label} يحجز مخزوناً منذ ${days} يوماً`,
              body: `${what} — بانتظار الموافقة. وافق عليه أو ارفضه أو ألغِه لتحرير المخزون.`,
            },
          },
        })) notified++
      }
    } catch (e) {
      errors.push(`${req.id}: ${e instanceof Error ? e.message : String(e)}`)
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
