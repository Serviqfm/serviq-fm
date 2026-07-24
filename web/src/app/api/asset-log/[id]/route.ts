// web/src/app/api/asset-log/[id]/route.ts
// PATCH — update fields (admin/manager/technician).
// DELETE — hard delete (admin only; blocked unless status='disposed').

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller, auditAssetLog } from '../_helpers'
import { ASSET_LOG_STATUSES } from '@/lib/asset-log'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'
import { FIELD_CATALOG } from '@/lib/field-catalog'

export const dynamic = 'force-dynamic'

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v); return Number.isFinite(n) ? n : null
  }
  return null
}
function int(v: unknown): number | null {
  const n = num(v); return n == null ? null : Math.trunc(n)
}

// Only these columns are patchable here. Location moves go through the RPC, and
// lifecycle (decommission) has its own route — both excluded on purpose.
const TEXT_FIELDS = [
  'name', 'name_ar', 'description', 'brand', 'model', 'serial_number',
  'invoice_ref', 'warranty_provider', 'condition_notes',
] as const
const DATE_FIELDS = ['purchase_date', 'warranty_expiry'] as const
const NUM_FIELDS = ['purchase_cost', 'replacement_cost', 'current_value_override'] as const
const INT_FIELDS = ['expected_lifespan_years', 'condition_review_interval_months'] as const

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 })

  const caller = await resolveCaller(['admin', 'manager', 'technician'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, admin } = caller

  const body = (await req.json()) as Record<string, unknown>

  // AG-14 — only full edit-form submits carry `name`; partial patches (e.g. a
  // quick status change from the detail page) skip the field-config gate.
  if ('name' in body) {
    const payload: Record<string, unknown> = {}
    for (const meta of FIELD_CATALOG.asset_log_edit) {
      payload[meta.key] = meta.key === 'photos' ? body.photo_urls : body[meta.key]
    }
    const res = await enforceFieldConfig(orgId, 'asset_log_edit', payload)
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  for (const f of TEXT_FIELDS) if (f in body) update[f] = str(body[f])
  for (const f of DATE_FIELDS) if (f in body) update[f] = str(body[f])
  for (const f of NUM_FIELDS) if (f in body) update[f] = num(body[f])
  for (const f of INT_FIELDS) if (f in body) update[f] = int(body[f])

  if ('type_id' in body) {
    const typeId = str(body.type_id)
    if (typeId) {
      const { data: t } = await admin
        .from('asset_log_types').select('id').eq('id', typeId).eq('organisation_id', orgId).maybeSingle()
      if (!t) return NextResponse.json({ error: 'Type not found in your organisation' }, { status: 400 })
    }
    update.type_id = typeId
  }
  if ('supplier_id' in body) {
    const supplierId = str(body.supplier_id)
    if (supplierId) {
      const { data: v } = await admin
        .from('vendors').select('id').eq('id', supplierId).eq('organisation_id', orgId).maybeSingle()
      if (!v) return NextResponse.json({ error: 'Supplier not found in your organisation' }, { status: 400 })
    }
    update.supplier_id = supplierId
  }
  if ('status' in body) {
    if (!ASSET_LOG_STATUSES.includes(body.status as never)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    update.status = body.status
  }
  if ('condition_rating' in body) {
    const r = int(body.condition_rating)
    if (r != null && (r < 1 || r > 5)) {
      return NextResponse.json({ error: 'Condition rating must be 1–5' }, { status: 400 })
    }
    update.condition_rating = r
  }
  if ('is_usable' in body) update.is_usable = body.is_usable === false ? false : true
  if (Array.isArray(body.photo_urls)) update.photo_urls = body.photo_urls
  if (typeof body.custom_fields === 'object' && body.custom_fields !== null) update.custom_fields = body.custom_fields

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }
  update.updated_at = new Date().toISOString()

  const { data: item, error } = await admin
    .from('asset_log_items')
    .update(update)
    .eq('id', id)
    .eq('organisation_id', orgId)
    .select()
    .single()

  if (error) {
    console.error('[asset-log PATCH] update failed', error)
    return NextResponse.json({ error: error.message || 'Failed to update item' }, { status: 500 })
  }
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  await auditAssetLog(admin, { userId, orgId }, id, 'Updated', { new_values: update })
  return NextResponse.json({ item })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 })

  const caller = await resolveCaller(['admin'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, admin } = caller

  // Blocked unless disposed — prevents accidental loss of live records.
  const { data: existing } = await admin
    .from('asset_log_items').select('id, status, name').eq('id', id).eq('organisation_id', orgId).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (existing.status !== 'disposed') {
    return NextResponse.json({ error: 'Only disposed items can be deleted. Decommission it first.' }, { status: 400 })
  }

  const { error } = await admin
    .from('asset_log_items').delete().eq('id', id).eq('organisation_id', orgId)
  if (error) {
    console.error('[asset-log DELETE] delete failed', error)
    return NextResponse.json({ error: error.message || 'Failed to delete item' }, { status: 500 })
  }

  await auditAssetLog(admin, { userId, orgId }, id, 'Deleted', { old_values: { name: existing.name } })
  return NextResponse.json({ ok: true })
}
