// web/src/app/api/asset-log/route.ts
// POST — create an Asset Log item. admin/manager/technician.
// Seeds default types on first use; writes an initial movement row when a space is set.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller, auditAssetLog, seedDefaultTypesIfEmpty } from './_helpers'
import { ASSET_LOG_STATUSES } from '@/lib/asset-log'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'
import { FIELD_CATALOG, FieldPage } from '@/lib/field-catalog'

export const dynamic = 'force-dynamic'

// AG-14 — validate against the org's asset_log field config (hide/require).
// Runs as a gate only: it rejects when an admin-required field is blank. The
// key 'photos' maps to the payload's photo_urls array.
async function enforceAssetLogFields(
  orgId: string, page: FieldPage, body: Record<string, unknown>
): Promise<{ error: string } | null> {
  const payload: Record<string, unknown> = {}
  for (const meta of FIELD_CATALOG[page]) {
    payload[meta.key] = meta.key === 'photos' ? body.photo_urls : body[meta.key]
  }
  const res = await enforceFieldConfig(orgId, page, payload)
  return 'error' in res ? { error: res.error } : null
}

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
function int(v: unknown): number | null {
  const n = num(v)
  return n == null ? null : Math.trunc(n)
}

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(['admin', 'manager', 'technician'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, admin } = caller

  const body = (await req.json()) as Record<string, unknown>

  const name = str(body.name)
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const fieldErr = await enforceAssetLogFields(orgId, 'asset_log_new', body)
  if (fieldErr) return NextResponse.json(fieldErr, { status: 400 })

  const trackingMode = body.tracking_mode === 'bulk' ? 'bulk' : 'unit'
  let quantity = int(body.quantity) ?? 1
  if (quantity < 1) quantity = 1
  if (trackingMode === 'unit') quantity = 1 // DB CHECK also enforces this

  const status = ASSET_LOG_STATUSES.includes(body.status as never)
    ? (body.status as string)
    : 'in_storage'

  const spaceId = str(body.space_id)
  let siteId = str(body.site_id)

  // Validate the space belongs to the caller's org (via its site) and derive the site.
  if (spaceId) {
    const { data: space } = await admin
      .from('spaces')
      .select('id, name, site:site_id(id, organisation_id)')
      .eq('id', spaceId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const site = space?.site as any
    if (!space || site?.organisation_id !== orgId) {
      return NextResponse.json({ error: 'Space not found in your organisation' }, { status: 400 })
    }
    siteId = site.id
  } else if (siteId) {
    const { data: site } = await admin
      .from('sites').select('id').eq('id', siteId).eq('organisation_id', orgId).maybeSingle()
    if (!site) return NextResponse.json({ error: 'Site not found in your organisation' }, { status: 400 })
  }

  // Validate the type belongs to the caller's org.
  const typeId = str(body.type_id)
  if (typeId) {
    const { data: type } = await admin
      .from('asset_log_types').select('id').eq('id', typeId).eq('organisation_id', orgId).maybeSingle()
    if (!type) return NextResponse.json({ error: 'Type not found in your organisation' }, { status: 400 })
  } else {
    // First-use convenience: make sure the org has the default type set available.
    await seedDefaultTypesIfEmpty(admin, orgId)
  }

  const supplierId = str(body.supplier_id)
  if (supplierId) {
    const { data: v } = await admin
      .from('vendors').select('id').eq('id', supplierId).eq('organisation_id', orgId).maybeSingle()
    if (!v) return NextResponse.json({ error: 'Supplier not found in your organisation' }, { status: 400 })
  }

  const conditionRating = int(body.condition_rating)
  if (conditionRating != null && (conditionRating < 1 || conditionRating > 5)) {
    return NextResponse.json({ error: 'Condition rating must be 1–5' }, { status: 400 })
  }

  const insertRow: Record<string, unknown> = {
    organisation_id: orgId,
    created_by: userId,
    name,
    name_ar: str(body.name_ar),
    description: str(body.description),
    type_id: typeId,
    brand: str(body.brand),
    model: str(body.model),
    serial_number: str(body.serial_number),
    photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls : [],
    custom_fields: typeof body.custom_fields === 'object' && body.custom_fields !== null ? body.custom_fields : {},
    tracking_mode: trackingMode,
    quantity,
    site_id: siteId,
    space_id: spaceId,
    status,
    purchase_date: str(body.purchase_date),
    purchase_cost: num(body.purchase_cost),
    replacement_cost: num(body.replacement_cost),
    current_value_override: num(body.current_value_override),
    expected_lifespan_years: int(body.expected_lifespan_years),
    supplier_id: supplierId,
    invoice_ref: str(body.invoice_ref),
    warranty_provider: str(body.warranty_provider),
    warranty_expiry: str(body.warranty_expiry),
    condition_rating: conditionRating,
    is_usable: body.is_usable === false ? false : true,
    condition_notes: str(body.condition_notes),
    condition_review_interval_months: int(body.condition_review_interval_months),
  }

  const { data: item, error } = await admin
    .from('asset_log_items')
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    console.error('[asset-log POST] insert failed', error)
    return NextResponse.json({ error: error.message || 'Failed to create item' }, { status: 500 })
  }

  // Initial movement row when the item starts life in a space.
  if (spaceId) {
    const { data: sp } = await admin.from('spaces').select('name').eq('id', spaceId).maybeSingle()
    await admin.from('asset_log_movements').insert({
      organisation_id: orgId,
      item_id: item.id,
      from_space_id: null,
      to_space_id: spaceId,
      from_space_name: null,
      to_space_name: sp?.name ?? null,
      quantity,
      note: 'Initial assignment',
      moved_by: userId,
    })
  }

  await auditAssetLog(admin, { userId, orgId }, item.id, 'Created', { new_values: { name, status } })

  return NextResponse.json({ item })
}
