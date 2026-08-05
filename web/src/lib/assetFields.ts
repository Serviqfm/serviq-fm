// web/src/lib/assetFields.ts
//
// AL-02: org-defined custom fields on MEP assets. Definitions live in the
// asset_field_defs table (org-scoped RLS); values live in the assets.custom_fields
// JSONB map keyed by def.key. Mirrors lib/customFields.ts (the shipped WO system).
//
// AL-04: custom asset statuses (asset_statuses) — display sub-states that map to a
// base asset status.
//
// AL-05: straight-line current-book-value calc.

export type AssetFieldType = 'text' | 'textarea' | 'number' | 'date' | 'dropdown'

export type AssetFieldDef = {
  id: string
  organisation_id: string
  key: string
  label: string
  label_ar: string | null
  type: AssetFieldType
  options: string[]
  sort_order: number
  is_active: boolean
}

export const ASSET_FIELD_TYPES: AssetFieldType[] = ['text', 'textarea', 'number', 'date', 'dropdown']

export const ASSET_FIELD_TYPE_LABELS: Record<AssetFieldType, { en: string; ar: string }> = {
  text:     { en: 'Text',      ar: 'نص' },
  textarea: { en: 'Multiline', ar: 'نص متعدد الأسطر' },
  number:   { en: 'Number',    ar: 'رقم' },
  date:     { en: 'Date',      ar: 'تاريخ' },
  dropdown: { en: 'Dropdown',  ar: 'قائمة منسدلة' },
}

// AL-04: base asset states the app already uses. Custom statuses map onto one.
export const ASSET_BASE_STATUSES = ['active', 'under_maintenance', 'retired'] as const
export type AssetBaseStatus = (typeof ASSET_BASE_STATUSES)[number]

export function assetBaseStatusLabel(s: string, lang: string): string {
  const en: Record<string, string> = { active: 'Active', under_maintenance: 'Under Maintenance', retired: 'Retired' }
  const ar: Record<string, string> = { active: 'نشط', under_maintenance: 'قيد الصيانة', retired: 'متقاعد' }
  return (lang === 'ar' ? ar : en)[s] ?? s
}

export type AssetStatus = {
  id: string
  label: string
  label_ar: string | null
  color: string | null
  maps_to_base_status: AssetBaseStatus
  sort_order: number
  is_active: boolean
}

// A slug key derived from a label — stable JSONB map key, safe as an HTML id.
export function slugifyKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

export function assetFieldLabel(def: AssetFieldDef, lang: string): string {
  return lang === 'ar' && def.label_ar ? def.label_ar : def.label
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

// AL-05: straight-line book value.
//   book = cost - (cost - salvage) * min(age/life, 1), floored at salvage.
// Returns null when there is no purchase cost to depreciate from. Guards
// divide-by-zero (life <= 0 → returns the undepreciated cost).
export function assetBookValue(a: {
  purchase_cost?: number | string | null
  purchase_date?: string | null
  salvage_value?: number | string | null
  useful_life_years?: number | string | null
}): number | null {
  const cost = toNum(a.purchase_cost)
  if (cost == null) return null

  const salvage = Math.max(0, toNum(a.salvage_value) ?? 0)
  const life = toNum(a.useful_life_years)
  if (life == null || life <= 0 || !a.purchase_date) return cost

  const ageYears = (Date.now() - new Date(a.purchase_date).getTime()) / (365.25 * 86400000)
  if (ageYears <= 0) return cost
  const depreciable = Math.max(0, cost - salvage)
  return Math.max(salvage, cost - depreciable * Math.min(ageYears / life, 1))
}

// ponytail: demo self-check for the money path — run with `npx tsx web/src/lib/assetFields.ts`.
if (typeof require !== 'undefined' && require.main === module) {
  const near = (x: number, y: number) => Math.abs(x - y) < 2 // date-math slack
  console.assert(assetBookValue({}) === null, 'no cost -> null')
  console.assert(assetBookValue({ purchase_cost: 1000 }) === 1000, 'no life -> full cost')
  console.assert(assetBookValue({ purchase_cost: 1000, useful_life_years: 0, purchase_date: '2000-01-01' }) === 1000, 'life 0 -> full cost (no div0)')
  // half-life, no salvage: 10yr life, ~5yr old -> ~50%
  const half = new Date(); half.setFullYear(half.getFullYear() - 5)
  const v = assetBookValue({ purchase_cost: 1000, useful_life_years: 10, purchase_date: half.toISOString() })
  console.assert(v != null && near(v, 500), 'half-life ~500, got ' + v)
  // half-life with salvage 200: depreciable 800, half gone -> ~600
  const vs = assetBookValue({ purchase_cost: 1000, salvage_value: 200, useful_life_years: 10, purchase_date: half.toISOString() })
  console.assert(vs != null && near(vs, 600), 'half-life salvage ~600, got ' + vs)
  // fully depreciated -> floored at salvage
  const old = new Date(); old.setFullYear(old.getFullYear() - 30)
  const z = assetBookValue({ purchase_cost: 1000, salvage_value: 200, useful_life_years: 10, purchase_date: old.toISOString() })
  console.assert(z === 200, 'floored at salvage 200, got ' + z)
  console.log('assetFields.ts self-check ok')
}
