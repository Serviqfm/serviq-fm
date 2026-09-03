// web/src/app/api/purchase-orders/[id]/route.ts
// PATCH — edit the shipping details of a DRAFT purchase order.
//
// Exists because delivery_address (P2) has to be settable on a PO that came from
// a converted requisition, which never passed through the create form. Draft-only:
// once a PO has been emailed to the vendor, the vendor's copy is the record, and
// changing the address behind it would be a lie.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '../_helpers'

export const dynamic = 'force-dynamic'

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const { data: po } = await admin
    .from('purchase_orders')
    .select('id, status')
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .maybeSingle()
  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  if (po.status !== 'draft') {
    return NextResponse.json({ error: 'Only a draft purchase order can be edited' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('delivery_address' in body) patch.delivery_address = str(body.delivery_address)
  if ('expected_at' in body) patch.expected_at = str(body.expected_at)
  if ('notes' in body) patch.notes = str(body.notes)

  const { data: updated, error } = await admin
    .from('purchase_orders')
    .update(patch)
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .select()
    .single()
  if (error) {
    console.error('[purchase-orders PATCH] update failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ purchase_order: updated })
}
