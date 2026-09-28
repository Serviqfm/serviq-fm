// POST — cancel a requisition.
//
// The status write goes through the SERVICE-ROLE client on purpose: the P1 guard
// trigger refuses a status change from an `authenticated` caller that did not
// come from submit_requisition()/decide_requisition(), and cancel is neither.
// The role gate below is therefore the real gate, not decoration.
//
// What the database does with it (procurement-09/10, on the status change):
//   * pending_approval -> cancelled: the held stock is released.
//   * approved/converted -> cancelled: issued stock goes BACK on the shelf with
//     a 'return_requisition' ledger row, and the cost center stops being charged.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'

export const dynamic = 'force-dynamic'

// 'converted' is missing on purpose: that requisition has become a purchase
// order, so the PO is what has to be cancelled — cancelling only this side
// would leave the PO live with nothing behind it.
const CANCELLABLE = ['draft', 'rejected', 'pending_approval', 'approved']

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager', 'technician'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, role, admin } = caller

  const { data: existing } = await admin
    .from('requisitions')
    .select('id, status, created_by')
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })

  if (existing.status === 'cancelled') {
    return NextResponse.json({ requisition: existing })  // idempotent
  }
  if (!CANCELLABLE.includes(existing.status as string)) {
    return NextResponse.json(
      { error: 'A converted requisition cannot be cancelled — cancel its purchase order instead' },
      { status: 400 }
    )
  }

  const privileged = ['admin', 'manager'].includes(role)
  // Anyone may withdraw their own request while it is still in flight. Undoing an
  // APPROVED one moves stock and money back, so that stays with admin/manager.
  if (existing.status === 'approved' && !privileged) {
    return NextResponse.json(
      { error: 'Only an admin or manager can cancel an approved requisition' },
      { status: 403 }
    )
  }
  if (existing.created_by !== userId && !privileged) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: requisition, error } = await admin
    .from('requisitions')
    .update({ status: 'cancelled', decided_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .select()
    .single()
  if (error) {
    console.error('[requisitions cancel] update failed', error)
    return NextResponse.json({ error: error.message || 'Failed to cancel' }, { status: 400 })
  }

  return NextResponse.json({ requisition })
}
