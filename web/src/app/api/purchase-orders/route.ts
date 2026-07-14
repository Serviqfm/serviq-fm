// web/src/app/api/purchase-orders/route.ts
// POST — create a purchase order + its line items. admin/manager.
// FK refs (vendor, inventory item) are scoped to the caller's org here in app code.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from './_helpers'

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

type LineInput = { item_id?: unknown; description?: unknown; quantity?: unknown; unit_cost?: unknown }

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(['admin', 'manager'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, admin } = caller

  const body = (await req.json()) as Record<string, unknown>

  // Validate vendor belongs to the caller's org.
  const vendorId = str(body.vendor_id)
  if (vendorId) {
    const { data: v } = await admin
      .from('vendors').select('id').eq('id', vendorId).eq('organisation_id', orgId).maybeSingle()
    if (!v) return NextResponse.json({ error: 'Vendor not found in your organisation' }, { status: 400 })
  }

  const siteId = str(body.site_id)
  if (siteId) {
    const { data: s } = await admin
      .from('sites').select('id').eq('id', siteId).eq('organisation_id', orgId).maybeSingle()
    if (!s) return NextResponse.json({ error: 'Site not found in your organisation' }, { status: 400 })
  }

  const rawLines = Array.isArray(body.lines) ? (body.lines as LineInput[]) : []
  if (rawLines.length === 0) {
    return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })
  }

  // Validate every referenced inventory item is in the caller's org.
  const itemIds = Array.from(new Set(rawLines.map(l => str(l.item_id)).filter(Boolean))) as string[]
  if (itemIds.length > 0) {
    const { data: items } = await admin
      .from('inventory_items').select('id').eq('organisation_id', orgId).in('id', itemIds)
    const found = new Set((items ?? []).map(i => i.id))
    const missing = itemIds.filter(id => !found.has(id))
    if (missing.length > 0) {
      return NextResponse.json({ error: 'One or more items are not in your organisation' }, { status: 400 })
    }
  }

  const status = ['draft', 'sent'].includes(body.status as string) ? (body.status as string) : 'draft'

  const { data: po, error: poErr } = await admin
    .from('purchase_orders')
    .insert({
      organisation_id: orgId,
      created_by: userId,
      vendor_id: vendorId,
      site_id: siteId,
      status,
      notes: str(body.notes),
      expected_at: str(body.expected_at),
    })
    .select()
    .single()

  if (poErr || !po) {
    console.error('[purchase-orders POST] header insert failed', poErr)
    return NextResponse.json({ error: poErr?.message || 'Failed to create purchase order' }, { status: 500 })
  }

  const lineRows = rawLines.map(l => ({
    organisation_id: orgId,
    purchase_order_id: po.id,
    item_id: str(l.item_id),
    description: str(l.description),
    quantity: num(l.quantity) ?? 1,
    unit_cost: num(l.unit_cost) ?? 0,
  }))

  const { error: liErr } = await admin.from('purchase_order_items').insert(lineRows)
  if (liErr) {
    // Roll back the header so we never leave an empty PO behind.
    await admin.from('purchase_orders').delete().eq('id', po.id)
    console.error('[purchase-orders POST] line insert failed', liErr)
    return NextResponse.json({ error: liErr.message || 'Failed to create line items' }, { status: 500 })
  }

  return NextResponse.json({ purchase_order: po })
}
