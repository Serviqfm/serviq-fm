// web/src/app/api/procurement/requisitions/[id]/convert/route.ts
// POST { vendor_id?, expected_at? } — turn an APPROVED requisition into a PO.
//
// Reuses the existing purchase_orders / purchase_order_items shape (playbook A1:
// shared tables, no procurement copies), so the new PO shows up in the ordinary
// PO list with a back-link to its requisition.
//
// This is the one place that writes BOTH sides of the requisition <-> PO link, so
// they cannot drift.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'

export const dynamic = 'force-dynamic'

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, admin } = caller

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const { data: requisition } = await admin
    .from('requisitions')
    .select('id, status, site_id, title, justification')
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .maybeSingle()
  if (!requisition) return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  if (requisition.status !== 'approved') {
    return NextResponse.json(
      { error: 'Only an approved requisition can be converted' },
      { status: 400 }
    )
  }

  const vendorId = str(body.vendor_id)
  if (vendorId) {
    const { data: v } = await admin
      .from('vendors').select('id').eq('id', vendorId).eq('organisation_id', orgId).maybeSingle()
    if (!v) return NextResponse.json({ error: 'Vendor not found in your organisation' }, { status: 400 })
  }

  const { data: lines } = await admin
    .from('requisition_items')
    .select('item_id, description, quantity, unit_cost')
    .eq('requisition_id', params.id)
    .eq('organisation_id', orgId)
  if (!lines || lines.length === 0) {
    return NextResponse.json({ error: 'Requisition has no line items' }, { status: 400 })
  }

  const { data: po, error: poErr } = await admin
    .from('purchase_orders')
    .insert({
      organisation_id: orgId,
      created_by: userId,
      vendor_id: vendorId,
      site_id: requisition.site_id,
      status: 'draft',
      notes: requisition.justification,
      expected_at: str(body.expected_at),
      requisition_id: requisition.id,
    })
    .select()
    .single()
  if (poErr || !po) {
    console.error('[requisitions convert] PO insert failed', poErr)
    return NextResponse.json({ error: poErr?.message || 'Failed to create purchase order' }, { status: 500 })
  }

  const { error: liErr } = await admin.from('purchase_order_items').insert(
    lines.map(l => ({
      organisation_id: orgId,
      purchase_order_id: po.id,
      item_id: l.item_id,
      description: l.description,
      quantity: l.quantity,
      unit_cost: l.unit_cost,
    }))
  )
  if (liErr) {
    // Roll back the header so a failed conversion leaves no empty PO behind.
    await admin.from('purchase_orders').delete().eq('id', po.id)
    console.error('[requisitions convert] PO line insert failed', liErr)
    return NextResponse.json({ error: liErr.message || 'Failed to copy line items' }, { status: 500 })
  }

  const { error: reqErr } = await admin
    .from('requisitions')
    .update({ status: 'converted', purchase_order_id: po.id, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organisation_id', orgId)
  if (reqErr) {
    // The PO exists and already points at the requisition (the authoritative
    // link), so this is recoverable — report it rather than deleting a real PO.
    console.error('[requisitions convert] status flip failed', reqErr)
    return NextResponse.json(
      { error: 'Purchase order created, but the requisition status could not be updated', purchase_order: po },
      { status: 500 }
    )
  }

  return NextResponse.json({ purchase_order: po })
}
