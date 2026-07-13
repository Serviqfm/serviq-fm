// Asset Log shared helpers (AG-1..AG-3 foundation).
// Straight-line current-value calc, status/label maps, and the default type seed.

export const ASSET_LOG_STATUSES = [
  'in_storage',
  'in_use',
  'under_repair',
  'damaged',
  'disposed',
] as const

export type AssetLogStatus = (typeof ASSET_LOG_STATUSES)[number]

export const ASSET_LOG_TRACKING_MODES = ['unit', 'bulk'] as const
export type AssetLogTrackingMode = (typeof ASSET_LOG_TRACKING_MODES)[number]

// Default item types seeded per org on first item creation (AG-2).
// name is the stable English key; name_ar/icon fill the bilingual + list UI.
export const DEFAULT_ASSET_LOG_TYPES: { name: string; name_ar: string; icon: string }[] = [
  { name: 'Furniture', name_ar: 'أثاث', icon: 'chair' },
  { name: 'IT Device', name_ar: 'جهاز تقني', icon: 'computer' },
  { name: 'Appliance', name_ar: 'جهاز', icon: 'kitchen' },
  { name: 'Signage', name_ar: 'لافتات', icon: 'signpost' },
  { name: 'Other', name_ar: 'أخرى', icon: 'category' },
]

// Effective current value: explicit override wins, else straight-line depreciation
// from purchase_cost over expected_lifespan_years, floored at 0. Returns null when
// there is nothing to compute from (no override and no purchase cost).
export function currentValue(item: {
  current_value_override?: number | string | null
  purchase_cost?: number | string | null
  purchase_date?: string | null
  expected_lifespan_years?: number | string | null
}): number | null {
  const override = toNum(item.current_value_override)
  if (override != null) return override

  const cost = toNum(item.purchase_cost)
  if (cost == null) return null

  const lifespan = toNum(item.expected_lifespan_years)
  if (lifespan == null || lifespan <= 0 || !item.purchase_date) return cost

  const ageYears = (Date.now() - new Date(item.purchase_date).getTime()) / (365.25 * 86400000)
  if (ageYears <= 0) return cost
  return Math.max(0, cost * (1 - ageYears / lifespan))
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

export function isWarrantyExpiringSoon(date?: string | null): boolean {
  if (!date) return false
  const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
  return days <= 30 && days >= 0
}

export function isWarrantyExpired(date?: string | null): boolean {
  return !!date && new Date(date) < new Date()
}

// "Review due" = last review + interval months has passed. No interval = never due.
export function isReviewDue(item: {
  last_condition_review_at?: string | null
  condition_review_interval_months?: number | null
}): boolean {
  const months = item.condition_review_interval_months
  if (!months || months <= 0) return false
  if (!item.last_condition_review_at) return true
  const due = new Date(item.last_condition_review_at)
  due.setMonth(due.getMonth() + months)
  return due < new Date()
}

// ponytail: demo self-check for the money path — run with `npx tsx web/src/lib/asset-log.ts`.
if (typeof require !== 'undefined' && require.main === module) {
  const near = (a: number, b: number) => Math.abs(a - b) < 2 // date-math slack
  // override wins
  console.assert(currentValue({ current_value_override: 500, purchase_cost: 999 }) === 500, 'override')
  // no cost -> null
  console.assert(currentValue({}) === null, 'null')
  // no lifespan -> full cost
  console.assert(currentValue({ purchase_cost: 1000 }) === 1000, 'full cost')
  // half-life straight line: 5yr lifespan, ~2.5yr old -> ~50%
  const half = new Date(); half.setFullYear(half.getFullYear() - 2, half.getMonth() - 6)
  const v = currentValue({ purchase_cost: 1000, expected_lifespan_years: 5, purchase_date: half.toISOString() })
  console.assert(v != null && near(v, 500), 'straight-line half, got ' + v)
  // fully depreciated -> floored at 0
  const old = new Date(); old.setFullYear(old.getFullYear() - 10)
  const z = currentValue({ purchase_cost: 1000, expected_lifespan_years: 5, purchase_date: old.toISOString() })
  console.assert(z === 0, 'floored 0, got ' + z)
  console.log('asset-log.ts self-check ok')
}
