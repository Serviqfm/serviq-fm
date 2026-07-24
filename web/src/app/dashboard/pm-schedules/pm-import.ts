// 1C-25 — pure validation/mapping for CSV-imported PM schedules. Kept out of the
// import page so it stays unit-testable (see pm-import.test.ts). The output row shape
// mirrors the insert the New PM Schedule form builds — same columns, same defaults —
// so imported and hand-created schedules behave identically. The generator is not
// touched: imported rows are ordinary pm_schedules.

export const IMPORT_COLUMNS = [
  'title', 'description', 'frequency', 'priority', 'category',
  'site_name', 'asset_name', 'next_due_at', 'end_date',
  'interval_count', 'interval_unit', 'anchor_day', 'estimated_duration_minutes',
] as const

export const VALID_FREQUENCIES = ['daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'biannual', 'annual']
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical']
const VALID_UNITS = ['day', 'week', 'month', 'year']

export type ImportContext = {
  organisationId: string
  sitesByName: Map<string, string>   // lower-cased name -> id
  assetsByName: Map<string, string>  // lower-cased name -> id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PmScheduleInsert = Record<string, any>

function toInt(v: string | undefined): number | null {
  if (!v || !v.trim()) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

// Map one trimmed CSV record to a pm_schedules insert row, or return an error string
// describing the first problem (so the importer can report it per-row and skip).
export function buildPmScheduleRow(
  raw: Record<string, string>,
  ctx: ImportContext,
): { row: PmScheduleInsert } | { error: string } {
  const title = (raw.title ?? '').trim()
  if (!title) return { error: 'missing title' }

  const frequency = (raw.frequency ?? '').trim().toLowerCase()
  if (!VALID_FREQUENCIES.includes(frequency)) {
    return { error: `invalid frequency "${raw.frequency ?? ''}" (expected one of: ${VALID_FREQUENCIES.join(', ')})` }
  }

  const nextDueRaw = (raw.next_due_at ?? '').trim()
  if (!nextDueRaw) return { error: 'missing next_due_at' }
  const nextDue = new Date(nextDueRaw)
  if (Number.isNaN(nextDue.getTime())) return { error: `unparseable next_due_at "${nextDueRaw}"` }

  const priority = (raw.priority ?? '').trim().toLowerCase() || 'medium'
  if (!VALID_PRIORITIES.includes(priority)) {
    return { error: `invalid priority "${raw.priority}" (expected one of: ${VALID_PRIORITIES.join(', ')})` }
  }

  // Optional site / asset resolved by name within the org; an unknown name is an
  // error rather than a silent NULL so the importer never mis-scopes a schedule.
  let siteId: string | null = null
  const siteName = (raw.site_name ?? '').trim()
  if (siteName) {
    const id = ctx.sitesByName.get(siteName.toLowerCase())
    if (!id) return { error: `unknown site "${siteName}"` }
    siteId = id
  }
  let assetId: string | null = null
  const assetName = (raw.asset_name ?? '').trim()
  if (assetName) {
    const id = ctx.assetsByName.get(assetName.toLowerCase())
    if (!id) return { error: `unknown asset "${assetName}"` }
    assetId = id
  }

  const intervalCount = toInt(raw.interval_count)
  const intervalUnit = (raw.interval_unit ?? '').trim().toLowerCase()
  if (intervalCount !== null && !VALID_UNITS.includes(intervalUnit)) {
    return { error: `interval_count set but interval_unit "${raw.interval_unit ?? ''}" invalid (expected one of: ${VALID_UNITS.join(', ')})` }
  }
  const endDateRaw = (raw.end_date ?? '').trim()

  return {
    row: {
      title,
      description: (raw.description ?? '').trim() || null,
      frequency,
      priority,
      category: (raw.category ?? '').trim() || null,
      site_id: siteId,
      asset_id: assetId,
      next_due_at: nextDue.toISOString(),
      end_date: endDateRaw || null,
      interval_count: intervalCount,
      interval_unit: intervalCount !== null ? intervalUnit : null,
      anchor_day: intervalCount !== null && ['month', 'year'].includes(intervalUnit) ? toInt(raw.anchor_day) : null,
      estimated_duration_minutes: toInt(raw.estimated_duration_minutes),
      organisation_id: ctx.organisationId,
      is_active: true,
    },
  }
}
