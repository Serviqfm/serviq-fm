// web/src/app/api/vendor-invoices/[id]/match/route.ts
// POST — run the 3-way match for one vendor invoice and store the verdict.
//
// The route only gathers the three documents; every judgement lives in the pure
// matcher (lib/threeWayMatch.ts), which is unit-tested exhaustively. What gets
// stored is a SNAPSHOT: match_detail records what the numbers were when the match
// ran, so a later goods receipt doesn't silently rewrite a recorded verdict.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'
import { threeWayMatch, type InvoiceLine, type PoLine } from '@/lib/threeWayMatch'
import { NotificationService } from '@/lib/NotificationService'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager'], 'can_view_financials')
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const { data: invoice } = await admin
    .from('vendor_invoices')
    .select('id, invoice_number, amount, purchase_order_id, vendor_id, status')
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .maybeSingle()
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (!invoice.purchase_order_id) {
    return NextResponse.json(
      { error: 'Link this invoice to a purchase order before matching it' },
      { status: 400 }
    )
  }

  const [poLinesRes, invLinesRes, receiptsRes] = await Promise.all([
    admin.from('purchase_order_items')
      .select('id, description, quantity, unit_cost, item:item_id(name)')
      .eq('purchase_order_id', invoice.purchase_order_id)
      .eq('organisation_id', orgId),
    admin.from('vendor_invoice_lines')
      .select('id, purchase_order_item_id, description, quantity, unit_price')
      .eq('vendor_invoice_id', params.id)
      .eq('organisation_id', orgId),
    admin.from('goods_receipts')
      .select('id, lines:goods_receipt_lines(purchase_order_item_id, qty_received, condition)')
      .eq('purchase_order_id', invoice.purchase_order_id)
      .eq('organisation_id', orgId),
  ])

  if (invLinesRes.error) {
    return NextResponse.json(
      { error: 'Invoice lines are unavailable — run procurement-05-three-way.sql' },
      { status: 400 }
    )
  }
  if (receiptsRes.error) {
    // Guessing zero received would flag every invoice as a mismatch, which is
    // worse than saying the data isn't there.
    return NextResponse.json(
      { error: 'Goods receipt data is unavailable — run procurement-04-goods-receipt.sql' },
      { status: 400 }
    )
  }

  const poLines: PoLine[] = (poLinesRes.data ?? []).map(l => ({
    id: l.id as string,
    // Prefer the inventory item's name; the free-text description is the fallback.
    description: (l.item as { name?: string } | null)?.name ?? (l.description as string | null),
    quantity: Number(l.quantity),
    unit_cost: Number(l.unit_cost),
  }))

  const invoiceLines: InvoiceLine[] = (invLinesRes.data ?? []).map(l => ({
    id: l.id as string,
    purchase_order_item_id: l.purchase_order_item_id as string | null,
    description: l.description as string | null,
    quantity: Number(l.quantity),
    unit_price: Number(l.unit_price),
  }))

  // Cumulative OK quantity per PO line — the same definition P3 uses to decide
  // whether an order is complete.
  const receivedByPoLine: Record<string, number> = {}
  for (const gr of receiptsRes.data ?? []) {
    for (const line of (gr.lines ?? []) as { purchase_order_item_id: string; qty_received: number; condition: string }[]) {
      if (line.condition !== 'ok') continue
      receivedByPoLine[line.purchase_order_item_id] =
        (receivedByPoLine[line.purchase_order_item_id] ?? 0) + Number(line.qty_received)
    }
  }

  const result = {
    ...threeWayMatch({
      poLines,
      receivedByPoLine,
      invoiceLines,
      invoiceTotal: Number(invoice.amount),
    }),
    matchedAt: new Date().toISOString(),
  }

  const { error: updErr } = await admin
    .from('vendor_invoices')
    .update({
      match_status: result.status,
      match_detail: result,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('organisation_id', orgId)
  if (updErr) {
    console.error('[vendor-invoices match] store failed', updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // A mismatch is somebody's job to chase. Best-effort — the verdict is stored.
  if (result.status === 'mismatch') {
    try {
      const { data: admins } = await admin
        .from('users').select('id')
        .eq('organisation_id', orgId).eq('role', 'admin').eq('is_active', true)

      const title = `Invoice ${invoice.invoice_number} failed the 3-way match`
      const body = `${result.issueCount} issue(s) across ${result.checks.filter(c => !c.pass).length} check(s)`
      const link = `${APP_URL}/dashboard/vendors/${invoice.vendor_id}/invoices/${params.id}`

      await Promise.allSettled((admins ?? []).map(a =>
        NotificationService.insertInApp(a.id as string, orgId, 'invoice_match_mismatch', {
          title, body, link,
          // One alert per invoice per match run.
          dedupeKey: `invoice_mismatch:${params.id}:${result.matchedAt}:${a.id}`,
          localized: { ar: { title: `الفاتورة ${invoice.invoice_number} لم تجتز المطابقة الثلاثية`, body } },
        })
      ))
    } catch (e) {
      console.error('[vendor-invoices match] mismatch notify failed', e)
    }
  }

  return NextResponse.json({ match: result })
}
