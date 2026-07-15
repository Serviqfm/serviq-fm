// web/src/app/api/asset-log/bulk-import/route.ts
//
// AG-7: bulk CSV import of Asset Log items. Manager/admin only (bulk create is a
// management action, matching WO-11). Resolves site/space by name and type by name
// (auto-creating unknown types), validates status/tracking_mode/condition per row,
// and inserts via the service-role client. When a space is set, writes the initial
// movement row the same way the single-item POST does.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller, seedDefaultTypesIfEmpty } from '../_helpers'
import { ASSET_LOG_STATUSES } from '@/lib/asset-log'

export const dynamic = 'force-dynamic'

const MAX_ROWS = 1000
const NUMERIC = /^\d+(\.\d+)?$/

type Row = Record<string, string>
type NameMap = { map: Map<string, string>; dup: Set<string> }

// Case-insensitive name→id map; tracks duplicate names so we warn instead of
// silently picking one (there is no unique-name constraint on sites/spaces).
function buildNameMap(rows: { id: string; name?: string | null }[] | null): NameMap {
  const map = new Map<string, string>()
  const dup = new Set<string>()
  for (const r of rows ?? []) {
    const k = (r.name ?? '').trim().toLowerCase()
    if (!k) continue
    if (map.has(k)) dup.add(k)
    else map.set(k, r.id)
  }
  return { map, dup }
}

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(['admin', 'manager'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, admin } = caller

  const body = (await req.json().catch(() => ({}))) as { rows?: unknown }
  const rows = Array.isArray(body.rows) ? (body.rows as Row[]) : []
  if (rows.length === 0) return NextResponse.json({ error: 'No rows to import' }, { status: 400 })
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS} per import)` }, { status: 400 })

  // Make sure the org has the default types before we try to resolve/create by name.
  await seedDefaultTypesIfEmpty(admin, orgId)

  const norm = (s: string) => s.trim().toLowerCase()
  const [sitesRes, spacesRes, typesRes] = await Promise.all([
    admin.from('sites').select('id, name').eq('organisation_id', orgId),
    admin.from('spaces').select('id, name, site_id').eq('organisation_id', orgId),
    admin.from('asset_log_types').select('id, name').eq('organisation_id', orgId),
  ])
  const siteMap = buildNameMap(sitesRes.data)
  const spaceMap = buildNameMap(spacesRes.data)
  const spaceSite = new Map((spacesRes.data ?? []).map(s => [s.id, s.site_id as string | null]))
  const typeByName = new Map((typesRes.data ?? []).map(t => [norm(t.name ?? ''), t.id]))

  let created = 0
  const errors: string[] = []
  const warnings: string[] = []

  // Resolve or lazily create a type by name; unknown types are auto-created (per spec).
  async function resolveType(nameRaw: string): Promise<string | undefined> {
    const k = norm(nameRaw)
    const existing = typeByName.get(k)
    if (existing) return existing
    const { data, error } = await admin
      .from('asset_log_types')
      .insert({ organisation_id: orgId, name: nameRaw.trim() })
      .select('id')
      .single()
    if (error || !data) return undefined
    typeByName.set(k, data.id)
    return data.id
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const ln = i + 2 // +1 for 0-index, +1 for the header line
    if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push(`Row ${ln}: malformed row`); continue }
    const get = (k: string) => (r[k] ?? '').toString().trim()

    const name = get('name')
    if (!name) { errors.push(`Row ${ln}: name is required`); continue }

    const rowErrors: string[] = []
    const insertRow: Record<string, unknown> = {
      organisation_id: orgId,
      created_by: userId,
      name,
      name_ar: get('name_ar') || null,
      description: get('description') || null,
      brand: get('brand') || null,
      model: get('model') || null,
      serial_number: get('serial_number') || null,
      invoice_ref: get('invoice_ref') || null,
      warranty_provider: get('warranty_provider') || null,
      warranty_expiry: get('warranty_expiry') || null,
      purchase_date: get('purchase_date') || null,
      condition_notes: get('condition_notes') || null,
    }

    // status
    if (get('status')) {
      const s = norm(get('status'))
      if (!ASSET_LOG_STATUSES.includes(s as never)) rowErrors.push(`invalid status "${get('status')}"`)
      else insertRow.status = s
    } else {
      insertRow.status = 'in_storage'
    }

    // tracking_mode + quantity (unit is forced to qty 1 by the DB CHECK)
    const trackingMode = norm(get('tracking_mode')) === 'bulk' ? 'bulk' : 'unit'
    insertRow.tracking_mode = trackingMode
    let quantity = 1
    if (get('quantity')) {
      if (!/^\d+$/.test(get('quantity'))) rowErrors.push(`invalid quantity "${get('quantity')}"`)
      else quantity = Math.max(1, parseInt(get('quantity'), 10))
    }
    insertRow.quantity = trackingMode === 'unit' ? 1 : quantity

    // numeric money/lifespan fields
    for (const [col, key] of [
      ['purchase_cost', 'purchase_cost'],
      ['replacement_cost', 'replacement_cost'],
      ['current_value_override', 'current_value_override'],
    ] as const) {
      if (get(key)) {
        if (!NUMERIC.test(get(key))) rowErrors.push(`invalid ${key} "${get(key)}"`)
        else insertRow[col] = parseFloat(get(key))
      }
    }
    for (const key of ['expected_lifespan_years', 'condition_review_interval_months'] as const) {
      if (get(key)) {
        if (!/^\d+$/.test(get(key))) rowErrors.push(`invalid ${key} "${get(key)}"`)
        else insertRow[key] = parseInt(get(key), 10)
      }
    }

    // condition rating 1–5
    if (get('condition_rating')) {
      const c = parseInt(get('condition_rating'), 10)
      if (!Number.isInteger(c) || c < 1 || c > 5) rowErrors.push(`condition_rating must be 1–5`)
      else insertRow.condition_rating = c
    }

    // is_usable — default true; only "false"/"no"/"0" flips it
    if (get('is_usable')) {
      insertRow.is_usable = !['false', 'no', '0', 'n'].includes(norm(get('is_usable')))
    }

    // type by name (auto-create unknown)
    if (get('type_name')) {
      const id = await resolveType(get('type_name'))
      if (!id) rowErrors.push(`could not resolve/create type "${get('type_name')}"`)
      else insertRow.type_id = id
    }

    // space by name — derives site; else site by name
    let spaceId: string | undefined
    let siteId: string | undefined
    if (get('space_name')) {
      const k = norm(get('space_name'))
      if (spaceMap.dup.has(k)) warnings.push(`Row ${ln}: space "${get('space_name')}" is ambiguous (duplicate name) — left blank`)
      else {
        const id = spaceMap.map.get(k)
        if (!id) rowErrors.push(`space "${get('space_name')}" not found`)
        else { spaceId = id; siteId = spaceSite.get(id) ?? undefined }
      }
    } else if (get('site_name')) {
      const k = norm(get('site_name'))
      if (siteMap.dup.has(k)) warnings.push(`Row ${ln}: site "${get('site_name')}" is ambiguous (duplicate name) — left blank`)
      else {
        const id = siteMap.map.get(k)
        if (!id) rowErrors.push(`site "${get('site_name')}" not found`)
        else siteId = id
      }
    }
    if (spaceId) insertRow.space_id = spaceId
    if (siteId) insertRow.site_id = siteId

    if (rowErrors.length > 0) { errors.push(`Row ${ln}: ${rowErrors.join('; ')}`); continue }

    const { data: item, error } = await admin.from('asset_log_items').insert(insertRow).select('id').single()
    if (error || !item) { errors.push(`Row ${ln}: ${error?.message ?? 'insert failed'}`); continue }
    created++

    // Initial movement row, mirroring the single-item POST.
    if (spaceId) {
      const spName = (spacesRes.data ?? []).find(s => s.id === spaceId)?.name ?? null
      await admin.from('asset_log_movements').insert({
        organisation_id: orgId,
        item_id: item.id,
        from_space_id: null,
        to_space_id: spaceId,
        from_space_name: null,
        to_space_name: spName,
        quantity: insertRow.quantity,
        note: 'Initial assignment (CSV import)',
        moved_by: userId,
      })
    }
  }

  return NextResponse.json({ created, errors, warnings })
}
