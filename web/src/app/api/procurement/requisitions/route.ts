// web/src/app/api/procurement/requisitions/route.ts
// POST — create a requisition + its line items.
//
// Any dashboard role may raise one (playbook P1: "all roles may create"); the
// approval chain, not the role gate, is what controls spending. FK refs (site,
// cost center, inventory item) are scoped to the caller's org here in app code,
// exactly like the purchase-orders create route.

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

type LineInput = { item_id?: unknown; description?: unknown; quantity?: unknown; unit_cost?: unknown }

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(['admin', 'manager', 'technician'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, admin } = caller

  const body = (await req.json()) as Record<string, unknown>

  const title = str(body.title)
  if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 })

  const siteId = str(body.site_id)
  if (siteId) {
    const { data: s } = await admin
      .from('sites').select('id').eq('id', siteId).eq('organisation_id', orgId).maybeSingle()
    if (!s) return NextResponse.json({ error: 'Site not found in your organisation' }, { status: 400 })
  }

  const costCenterId = str(body.cost_center_id)
  if (costCenterId) {
    const { data: c } = await admin
      .from('cost_centers').select('id').eq('id', costCenterId).eq('organisation_id', orgId).maybeSingle()
    if (!c) return NextResponse.json({ error: 'Cost center not found in your organisation' }, { status: 400 })
  }

  const rawLines = Array.isArray(body.lines) ? (body.lines as LineInput[]) : []
  if (rawLines.length === 0) {
    return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })
  }

  const itemIds = Array.from(new Set(rawLines.map(l => str(l.item_id)).filter(Boolean))) as string[]
  if (itemIds.length > 0) {
    const { data: items } = await admin
      .from('inventory_items').select('id').eq('organisation_id', orgId).in('id', itemIds)
    const found = new Set((items ?? []).map(i => i.id))
    if (itemIds.some(id => !found.has(id))) {
      return NextResponse.json({ error: 'One or more items are not in your organisation' }, { status: 400 })
    }
  }

  const { data: requisition, error: reqErr } = await admin
    .from('requisitions')
    .insert({
      organisation_id: orgId,
      created_by: userId,
      title,
      justification: str(body.justification),
      site_id: siteId,
      cost_center_id: costCenterId,
      needed_by: str(body.needed_by),
      status: 'draft',
    })
    .select()
    .single()

  if (reqErr || !requisition) {
    console.error('[requisitions POST] header insert failed', reqErr)
    return NextResponse.json({ error: reqErr?.message || 'Failed to create requisition' }, { status: 500 })
  }

  const lineRows = rawLines.map(l => ({
    organisation_id: orgId,
    requisition_id: requisition.id,
    item_id: str(l.item_id),
    description: str(l.description),
    quantity: num(l.quantity) ?? 1,
    unit_cost: num(l.unit_cost) ?? 0,
  }))

  const { error: liErr } = await admin.from('requisition_items').insert(lineRows)
  if (liErr) {
    // Roll back the header so we never leave an empty requisition behind.
    await admin.from('requisitions').delete().eq('id', requisition.id)
    console.error('[requisitions POST] line insert failed', liErr)
    return NextResponse.json({ error: liErr.message || 'Failed to create line items' }, { status: 500 })
  }

  return NextResponse.json({ requisition })
}
