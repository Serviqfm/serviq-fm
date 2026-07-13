// web/src/app/api/asset-log/[id]/repairs/route.ts
// POST — add a repair ledger entry (admin/manager/technician).
// Optional set_status flips the item to under_repair / in_use.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller, auditAssetLog } from '../../_helpers'

export const dynamic = 'force-dynamic'

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v); return Number.isFinite(n) ? n : null
  }
  return null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 })

  const caller = await resolveCaller(['admin', 'manager', 'technician'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, admin } = caller

  const body = (await req.json()) as Record<string, unknown>

  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 })

  // Item must exist in the caller's org before we ledger a repair against it.
  const { data: item } = await admin
    .from('asset_log_items').select('id').eq('id', id).eq('organisation_id', orgId).maybeSingle()
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const vendorId = typeof body.vendor_id === 'string' && body.vendor_id.trim() !== '' ? body.vendor_id.trim() : null
  if (vendorId) {
    const { data: v } = await admin
      .from('vendors').select('id').eq('id', vendorId).eq('organisation_id', orgId).maybeSingle()
    if (!v) return NextResponse.json({ error: 'Vendor not found in your organisation' }, { status: 400 })
  }
  const workOrderId = typeof body.work_order_id === 'string' && body.work_order_id.trim() !== '' ? body.work_order_id.trim() : null
  if (workOrderId) {
    const { data: wo } = await admin
      .from('work_orders').select('id').eq('id', workOrderId).eq('organisation_id', orgId).maybeSingle()
    if (!wo) return NextResponse.json({ error: 'Work order not found in your organisation' }, { status: 400 })
  }

  const { data: repair, error } = await admin
    .from('asset_log_repairs')
    .insert({
      organisation_id: orgId,
      item_id: id,
      description,
      cost: num(body.cost) ?? 0,
      repaired_at: typeof body.repaired_at === 'string' && body.repaired_at.trim() !== ''
        ? body.repaired_at.trim() : new Date().toISOString().slice(0, 10),
      vendor_id: vendorId,
      work_order_id: workOrderId,
      created_by: userId,
    })
    .select()
    .single()

  if (error) {
    console.error('[asset-log repairs] insert failed', error)
    return NextResponse.json({ error: error.message || 'Failed to add repair' }, { status: 500 })
  }

  if (body.set_status === 'under_repair' || body.set_status === 'in_use') {
    await admin.from('asset_log_items')
      .update({ status: body.set_status, updated_at: new Date().toISOString() })
      .eq('id', id).eq('organisation_id', orgId)
  }

  await auditAssetLog(admin, { userId, orgId }, id, 'Repair logged', { new_values: { description } })
  return NextResponse.json({ repair })
}
