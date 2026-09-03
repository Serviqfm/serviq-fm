// web/src/app/api/purchase-orders/[id]/receive/route.ts
// POST — receive a purchase order.
//
// Body is OPTIONAL and backward compatible:
//   {}                       -> receive every outstanding line as ok (the old
//                               all-or-nothing behaviour, unchanged)
//   { lines: [ { purchase_order_item_id, qty_received, condition,
//                bin_location, note }, ... ] }
//                            -> a per-line partial receipt (P3)
//
// All the work happens inside receive_purchase_order_lines() (SECURITY DEFINER,
// org-verified via auth.uid()): it writes the goods receipt, moves stock for ok
// quantities only, and flips the PO to 'received' just when every line is
// covered. It MUST run on the user-session client — the service-role client's
// auth.uid() is null.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveCaller } from '../../_helpers'
import { NotificationService } from '@/lib/NotificationService'

export const dynamic = 'force-dynamic'

const CONDITIONS = ['ok', 'damaged', 'wrong_item', 'short']
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'

type LineInput = {
  purchase_order_item_id?: unknown
  qty_received?: unknown
  condition?: unknown
  bin_location?: unknown
  note?: unknown
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const body = (await req.json().catch(() => ({}))) as { lines?: unknown }
  const rawLines = Array.isArray(body.lines) ? (body.lines as LineInput[]) : []

  // Normalise + validate before touching the DB, so a typo in one line can't
  // half-apply a receipt.
  const lines = []
  for (const l of rawLines) {
    const itemId = str(l.purchase_order_item_id)
    const qty = Number(l.qty_received)
    if (!itemId) {
      return NextResponse.json({ error: 'Every line needs a purchase_order_item_id' }, { status: 400 })
    }
    if (!Number.isFinite(qty) || qty <= 0) continue // nothing arrived for this line
    const condition = str(l.condition) ?? 'ok'
    if (!CONDITIONS.includes(condition)) {
      return NextResponse.json(
        { error: `condition must be one of: ${CONDITIONS.join(', ')}` },
        { status: 400 }
      )
    }
    lines.push({
      purchase_order_item_id: itemId,
      qty_received: qty,
      condition,
      bin_location: str(l.bin_location),
      note: str(l.note),
    })
  }

  if (rawLines.length > 0 && lines.length === 0) {
    return NextResponse.json({ error: 'No line had a quantity to receive' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('receive_purchase_order_lines', {
    p_po_id: params.id,
    p_lines: lines.length > 0 ? lines : null,
  })
  if (error) {
    console.error('[purchase-orders receive] rpc failed', error)
    return NextResponse.json({ error: error.message || 'Failed to receive purchase order' }, { status: 400 })
  }

  const po = data as { id: string; po_number: number | null; status: string; created_by: string | null }

  // Discrepancies are the whole point of recording a condition — tell the people
  // who have to chase the vendor. Best-effort: the receipt is already committed.
  const flagged = lines.filter(l => l.condition !== 'ok')
  if (flagged.length > 0) {
    try {
      const { data: admins } = await admin
        .from('users').select('id')
        .eq('organisation_id', orgId).eq('role', 'admin').eq('is_active', true)

      const recipients = new Set<string>((admins ?? []).map(a => a.id as string))
      if (po.created_by) recipients.add(po.created_by)

      const summary = flagged.map(l => `${l.qty_received} ${l.condition.replace(/_/g, ' ')}`).join(', ')
      const title = `Delivery discrepancy on PO #${po.po_number}`
      const body = `${flagged.length} line(s) flagged: ${summary}`
      const link = `${APP_URL}/dashboard/purchase-orders/${params.id}`

      await Promise.allSettled(Array.from(recipients).map(userId =>
        NotificationService.insertInApp(userId, orgId, 'po_receipt_discrepancy', {
          title, body, link,
          localized: { ar: { title: `تباين في استلام أمر الشراء #${po.po_number}`, body } },
        })
      ))
    } catch (e) {
      console.error('[purchase-orders receive] discrepancy notify failed', e)
    }
  }

  return NextResponse.json({ purchase_order: po, flagged: flagged.length })
}
