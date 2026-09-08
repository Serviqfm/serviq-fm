// web/src/app/api/vendor-invoices/[id]/route.ts
// PATCH — link an invoice to a purchase order and record what it billed.
//
// Both are inputs to the 3-way match, so neither is editable once the invoice is
// paid: re-pointing a paid invoice at a different PO would rewrite history the
// match_detail snapshot was taken against.
//
// Lines are replaced wholesale when `lines` is present — simple, atomic enough
// for a document you are transcribing, and it saves the client diffing.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'

export const dynamic = 'force-dynamic'

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

type LineInput = {
  purchase_order_item_id?: unknown
  description?: unknown
  quantity?: unknown
  unit_price?: unknown
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager'], 'can_view_financials')
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const { data: invoice } = await admin
    .from('vendor_invoices')
    .select('id, status, vendor_id')
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (invoice.status === 'paid') {
    return NextResponse.json({ error: 'A paid invoice can no longer be edited' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ('purchase_order_id' in body) {
    const poId = str(body.purchase_order_id)
    if (poId) {
      const { data: po } = await admin
        .from('purchase_orders')
        .select('id, vendor_id')
        .eq('id', poId)
        .eq('organisation_id', orgId)
        .maybeSingle()
      if (!po) {
        return NextResponse.json({ error: 'Purchase order not found in your organisation' }, { status: 400 })
      }
      // Matching an invoice against another vendor's order is always a mistake.
      if (po.vendor_id && invoice.vendor_id && po.vendor_id !== invoice.vendor_id) {
        return NextResponse.json(
          { error: 'That purchase order belongs to a different vendor' },
          { status: 400 }
        )
      }
    }
    patch.purchase_order_id = poId
    // The stored verdict was computed against the OLD order; drop it rather than
    // leave a match_detail that no longer describes this invoice.
    patch.match_status = 'unmatched'
    patch.match_detail = null
  }

  if ('amount' in body) {
    const amount = num(body.amount)
    if (amount === null || amount < 0) {
      return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 })
    }
    patch.amount = amount
  }

  const { error: updErr } = await admin
    .from('vendor_invoices').update(patch).eq('id', params.id).eq('organisation_id', orgId)
  if (updErr) {
    console.error('[vendor-invoices PATCH] update failed', updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  if (Array.isArray(body.lines)) {
    const rawLines = body.lines as LineInput[]

    // Validate every PO-line reference belongs to this org before writing anything.
    const poItemIds = Array.from(new Set(
      rawLines.map(l => str(l.purchase_order_item_id)).filter(Boolean)
    )) as string[]
    if (poItemIds.length > 0) {
      const { data: items } = await admin
        .from('purchase_order_items').select('id').eq('organisation_id', orgId).in('id', poItemIds)
      const found = new Set((items ?? []).map(i => i.id))
      if (poItemIds.some(id => !found.has(id))) {
        return NextResponse.json(
          { error: 'One or more lines reference a purchase order line outside your organisation' },
          { status: 400 }
        )
      }
    }

    const rows = rawLines
      .filter(l => (num(l.quantity) ?? 0) > 0)
      .map(l => ({
        organisation_id: orgId,
        vendor_invoice_id: params.id,
        purchase_order_item_id: str(l.purchase_order_item_id),
        description: str(l.description),
        quantity: num(l.quantity) ?? 1,
        unit_price: num(l.unit_price) ?? 0,
      }))

    await admin.from('vendor_invoice_lines').delete()
      .eq('vendor_invoice_id', params.id).eq('organisation_id', orgId)

    if (rows.length > 0) {
      const { error: liErr } = await admin.from('vendor_invoice_lines').insert(rows)
      if (liErr) {
        console.error('[vendor-invoices PATCH] line replace failed', liErr)
        return NextResponse.json({ error: liErr.message }, { status: 500 })
      }
    }

    // Lines changed, so any stored verdict is stale.
    await admin.from('vendor_invoices')
      .update({ match_status: 'unmatched', match_detail: null })
      .eq('id', params.id).eq('organisation_id', orgId)
  }

  const { data: updated } = await admin
    .from('vendor_invoices').select().eq('id', params.id).single()
  return NextResponse.json({ invoice: updated })
}
