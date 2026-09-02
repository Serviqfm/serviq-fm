// web/src/app/api/procurement/requisitions/[id]/submit/route.ts
// POST — submit a requisition for approval.
//
// All the real work happens inside submit_requisition() (SECURITY DEFINER,
// org-verified via auth.uid(), idempotent): it sums the lines, picks the active
// threshold band, materialises the approval chain and flips the status. It MUST
// run on the user-session client — not the service-role client, whose auth.uid()
// is null (same rule as the PO receive route).
//
// The route's own job afterwards is only to notify.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'
import { notifyCurrentApprover, notifyCreatorDecided } from '../../_notify'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager', 'technician'])
  if (caller instanceof NextResponse) return caller

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('submit_requisition', { p_id: params.id })
  if (error) {
    console.error('[requisitions submit] rpc failed', error)
    return NextResponse.json({ error: error.message || 'Failed to submit requisition' }, { status: 400 })
  }

  const requisition = data as {
    id: string; organisation_id: string; status: string
    requisition_number: number | null; title: string | null; created_by: string | null
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
  } catch (e) {
    console.error('[requisitions submit] notify failed', e)
  }

  return NextResponse.json({ requisition })
}
