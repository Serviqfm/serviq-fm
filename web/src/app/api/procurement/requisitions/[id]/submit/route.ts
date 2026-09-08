// web/src/app/api/procurement/requisitions/[id]/submit/route.ts
// POST — submit a requisition for approval.
//
// All the real work happens inside submit_requisition() (SECURITY DEFINER,
// org-verified via auth.uid(), idempotent): it sums the lines, enforces the P5
// budget block, picks the active threshold band, materialises the approval chain
// and flips the status. It MUST run on the user-session client — not the
// service-role client, whose auth.uid() is null (same rule as the PO receive route).
//
// The route's own job afterwards is only to notify.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'
import { notifyCurrentApprover, notifyCreatorDecided } from '../../_notify'
import { parseBudgetError, budgetUsage } from '@/lib/budget'
import { NotificationService } from '@/lib/NotificationService'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'

// 75%/90% crossings are a WARNING, not a block, so they cannot live in the RPC:
// raising there would roll the submit back. The route re-reads budget_spend once
// the submit has committed and tells the admins where the cost center now stands.
async function notifyBudgetThreshold(
  admin: SupabaseClient,
  orgId: string,
  costCenterId: string
): Promise<void> {
  const { data: period } = await admin
    .from('budget_periods')
    .select('id, starts_on, ends_on, amount')
    .eq('cost_center_id', costCenterId)
    .eq('organisation_id', orgId)
    .lte('starts_on', new Date().toISOString().slice(0, 10))
    .gte('ends_on', new Date().toISOString().slice(0, 10))
    .order('starts_on', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!period) return

  const { data: spend } = await admin
    .rpc('budget_spend', {
      p_cost_center: costCenterId,
      p_from: period.starts_on,
      p_to: period.ends_on,
    })
    .maybeSingle() as { data: { reserved: number; actual: number } | null }
  if (!spend) return

  const usage = budgetUsage({
    reserved: Number(spend.reserved ?? 0),
    actual: Number(spend.actual ?? 0),
    amount: Number(period.amount ?? 0),
  })
  if (usage.crossed === null) return

  const { data: cc } = await admin
    .from('cost_centers').select('name').eq('id', costCenterId).maybeSingle()
  const { data: admins } = await admin
    .from('users').select('id')
    .eq('organisation_id', orgId).eq('role', 'admin').eq('is_active', true)

  const name = cc?.name ?? 'Cost center'
  const title = `${name} is at ${usage.percent}% of its budget`
  const body = `${usage.used.toFixed(2)} committed of ${Number(period.amount).toFixed(2)} SAR`
  const link = `${APP_URL}/dashboard/cost-centers/${costCenterId}`

  await Promise.allSettled((admins ?? []).map(a =>
    NotificationService.insertInApp(a.id as string, orgId, 'budget_threshold', {
      title, body, link,
      // Once per threshold per period per admin — crossing 75% then 90% alerts
      // twice, but staying above 75% does not alert on every submit.
      dedupeKey: `budget_threshold:${period.id}:${usage.crossed}:${a.id}`,
      localized: { ar: { title: `${name} بلغ ${usage.percent}% من الميزانية`, body } },
    })
  ))
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager', 'technician'])
  if (caller instanceof NextResponse) return caller

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('submit_requisition', { p_id: params.id })
  if (error) {
    // A budget block is an expected outcome, not a failure to report as one:
    // hand the UI the numbers so it can say WHY in the caller's language.
    const breach = parseBudgetError(error.message)
    if (breach) {
      return NextResponse.json(
        { error: 'Budget exceeded', code: 'budget_exceeded', budget: breach },
        { status: 400 }
      )
    }
    console.error('[requisitions submit] rpc failed', error)
    return NextResponse.json({ error: error.message || 'Failed to submit requisition' }, { status: 400 })
  }

  const requisition = data as {
    id: string; organisation_id: string; status: string
    requisition_number: number | null; title: string | null
    created_by: string | null; cost_center_id: string | null
  }

  // Best-effort: the decision is already committed, so a notification failure
  // must not turn a successful submit into an error.
  try {
    if (requisition.status === 'pending_approval') {
      await notifyCurrentApprover(caller.admin, requisition)
    } else if (requisition.status === 'approved') {
      // No band matched (or the band had no approvers) — auto-approved.
      await notifyCreatorDecided(caller.admin, requisition, requisition.created_by, true, null)
    }
    if (requisition.cost_center_id) {
      await notifyBudgetThreshold(caller.admin, requisition.organisation_id, requisition.cost_center_id)
    }
  } catch (e) {
    console.error('[requisitions submit] notify failed', e)
  }

  return NextResponse.json({ requisition })
}
