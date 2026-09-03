// web/src/app/api/purchase-orders/[id]/status/route.ts
// PATCH { status } — advance a PO along its lifecycle.
//
// The lifecycle is FORWARD-ONLY and that is enforced here, server-side: the UI
// stepper only hides buttons. There is no vendor portal in V1, so acknowledged
// and in_transit are recorded manually by whoever is chasing the order.
//
// The two ends of the lifecycle are deliberately NOT settable here:
//   * 'sent'     belongs to the send route — it means the vendor was emailed.
//   * 'received' belongs to receive_purchase_order() — it moves stock.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '../../_helpers'
import { canAdvance, PO_MANUAL_ADVANCE } from '@/lib/purchaseOrders'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const body = (await req.json().catch(() => ({}))) as { status?: unknown }
  const target = typeof body.status === 'string' ? body.status : ''

  const { data: po } = await admin
    .from('purchase_orders')
    .select('id, status')
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .maybeSingle()
  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

  const check = canAdvance(po.status, target)
  if (!check.ok) {
    const message = check.reason === 'not_advanceable'
      ? `status must be one of: ${PO_MANUAL_ADVANCE.join(', ')}`
      : check.reason === 'terminal'
        ? `A ${po.status} purchase order cannot be advanced`
        : `Cannot move a ${po.status} purchase order back to ${target}`
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { data: updated, error } = await admin
    .from('purchase_orders')
    .update({ status: target, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .select()
    .single()
  if (error) {
    console.error('[purchase-orders status] update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ purchase_order: updated })
}
