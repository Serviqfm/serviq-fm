// web/src/app/api/purchase-orders/[id]/send/route.ts
// POST — email the PO to its vendor as a PDF and flip draft -> sent.
//
// The status flip happens ONLY after the mail provider accepts the message: a PO
// marked 'sent' is a promise that the vendor actually received it, so a failed
// send leaves the PO in draft to be retried rather than silently advancing.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '../../_helpers'
import { poPdfBuffer, type PoLine, type PoRecord } from '@/lib/po-pdf'
import { sendEmail } from '@/lib/email'
import { escapeHtml } from '@/lib/escapeHtml'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const { data: po } = await admin
    .from('purchase_orders')
    .select('*, vendor:vendor_id(company_name, contact_name, email, payment_terms), site:site_id(name)')
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .maybeSingle() as { data: (PoRecord & { id: string; status: string }) | null }

  if (!po) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
  if (po.status !== 'draft') {
    return NextResponse.json({ error: 'Only a draft purchase order can be sent' }, { status: 400 })
  }

  const vendorEmail = po.vendor?.email ?? null
  if (!vendorEmail) {
    return NextResponse.json(
      { error: 'This vendor has no email address on file' },
      { status: 400 }
    )
  }

  const { data: lines } = await admin
    .from('purchase_order_items')
    .select('description, quantity, unit_cost, item:item_id(name, sku)')
    .eq('purchase_order_id', params.id)
    .eq('organisation_id', orgId) as { data: PoLine[] | null }

  const { data: org } = await admin
    .from('organisations').select('name').eq('id', orgId).maybeSingle()
  const orgName = org?.name ?? 'ServIQ-FM'

  let buffer: Buffer
  try {
    buffer = await poPdfBuffer(po, lines ?? [], orgName)
  } catch (e) {
    console.error('[purchase-orders send] pdf render failed', e)
    return NextResponse.json({ error: 'Failed to render the purchase order PDF' }, { status: 500 })
  }

  const subject = `Purchase Order #${po.po_number} — ${orgName}`
  const html = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>Purchase Order #${escapeHtml(po.po_number)}</h2>
    <p>${escapeHtml(orgName)} has issued you a purchase order. The full order is attached as a PDF.</p>
    ${po.expected_at ? `<p><strong>Expected by:</strong> ${escapeHtml(po.expected_at)}</p>` : ''}
    ${po.delivery_address ? `<p><strong>Deliver to:</strong> ${escapeHtml(po.delivery_address)}</p>` : ''}
    <p>Please confirm receipt of this order by replying to this email.</p>
  </div>`

  const { success, error } = await sendEmail(
    vendorEmail, subject, html,
    [{ filename: `purchase-order-${po.po_number}.pdf`, content: buffer }],
  )
  if (!success) {
    console.error('[purchase-orders send] email failed', error)
    return NextResponse.json(
      { error: error ?? 'Failed to email the purchase order — it is still a draft' },
      { status: 502 }
    )
  }

  const { data: updated, error: updErr } = await admin
    .from('purchase_orders')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      vendor_email_snapshot: vendorEmail,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('organisation_id', orgId)
    .select()
    .single()

  if (updErr) {
    // The vendor HAS the PO; only our bookkeeping failed. Say so rather than
    // implying the send didn't happen.
    console.error('[purchase-orders send] status flip failed after a successful send', updErr)
    return NextResponse.json(
      { error: 'The purchase order was emailed but its status could not be updated' },
      { status: 500 }
    )
  }

  return NextResponse.json({ purchase_order: updated, sent_to: vendorEmail })
}
