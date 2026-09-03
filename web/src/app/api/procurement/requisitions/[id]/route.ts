// web/src/app/api/procurement/requisitions/[id]/route.ts
// PATCH — edit a requisition that has NOT entered approval.
//
// Only draft and rejected requisitions are editable (the rejected case is the
// revision loop: fix it, resubmit, and submit_requisition() rebuilds the chain).
// Anything in flight, approved or converted is frozen — its total is what the
// approval chain was picked from.
//
// Lines are replaced wholesale when `lines` is present: simpler and atomic-enough
// for a draft, and it keeps the client from having to diff.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'

export const dynamic = 'force-dynamic'

const EDITABLE = ['draft', 'rejected']

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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

  if (!EDITABLE.includes(existing.status)) {
    return NextResponse.json(
      { error: 'Only draft or rejected requisitions can be edited' },
      { status: 400 }
    )
  }
  if (existing.created_by !== userId && !['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as Record<string, unknown>

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

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('title' in body) {
    const title = str(body.title)
    if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 })
    patch.title = title
  }
  if ('justification' in body) patch.justification = str(body.justification)
  if ('site_id' in body) patch.site_id = siteId
  if ('cost_center_id' in body) patch.cost_center_id = costCenterId
  if ('needed_by' in body) patch.needed_by = str(body.needed_by)

  const { error: updErr } = await admin
    .from('requisitions').update(patch).eq('id', params.id).eq('organisation_id', orgId)
  if (updErr) {
    console.error('[requisitions PATCH] update failed', updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  if (Array.isArray(body.lines)) {
    const rawLines = body.lines as LineInput[]
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

    await admin.from('requisition_items').delete()
      .eq('requisition_id', params.id).eq('organisation_id', orgId)
    const { error: liErr } = await admin.from('requisition_items').insert(
      rawLines.map(l => ({
        organisation_id: orgId,
        requisition_id: params.id,
        item_id: str(l.item_id),
        description: str(l.description),
        quantity: num(l.quantity) ?? 1,
        unit_cost: num(l.unit_cost) ?? 0,
      }))
    )
    if (liErr) {
      console.error('[requisitions PATCH] line replace failed', liErr)
      return NextResponse.json({ error: liErr.message }, { status: 500 })
    }
  }

  const { data: requisition } = await admin
    .from('requisitions').select().eq('id', params.id).single()
  return NextResponse.json({ requisition })
}
