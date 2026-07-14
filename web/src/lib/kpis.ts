// Real maintenance KPIs computed from work_orders / users rows.
// Pure functions over already-fetched, org-scoped rows — no aggregation RPC
// needed because the reports page already pulls the org's rows (same pattern
// the dashboard uses). See kpis.test.ts for the worked examples.
// CORE-13 (MTTR/MTBF/cost/active-techs) + FM-03/FM-12 (SLA response/resolution).

export interface WoKpiRow {
  status?: string | null
  priority?: string | null
  created_at?: string | null
  completed_at?: string | null
  due_at?: string | null
  sla_hours?: number | null
  actual_cost?: number | null
  asset_id?: string | null
  assigned_to?: string | null
  wo_number?: string | null
  title?: string | null
}

export interface TechRow {
  role?: string | null
  is_active?: boolean | null
  last_sign_in_at?: string | null
}

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

function hoursBetween(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null
  const start = new Date(a).getTime()
  const end = new Date(b).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return (end - start) / HOUR_MS
}

/** Mean Time To Repair: avg(completed_at − created_at) in hours, over completed WOs. null if none. */
export function mttrHours(rows: WoKpiRow[]): number | null {
  const spans = rows.map(r => hoursBetween(r.created_at, r.completed_at)).filter((h): h is number => h != null)
  if (spans.length === 0) return null
  return spans.reduce((s, h) => s + h, 0) / spans.length
}

/**
 * Mean Time Between Failures: for each asset with >=2 completed WOs, the avg gap
 * (days) between consecutive completions; then averaged across assets. null if
 * no asset has two completions. WOs without an asset_id are ignored (no series).
 */
export function mtbfDays(rows: WoKpiRow[]): number | null {
  const byAsset = new Map<string, number[]>()
  for (const r of rows) {
    if (!r.asset_id || !r.completed_at) continue
    const t = new Date(r.completed_at).getTime()
    if (Number.isNaN(t)) continue
    const arr = byAsset.get(r.asset_id) ?? []
    arr.push(t)
    byAsset.set(r.asset_id, arr)
  }
  const perAssetAvg: number[] = []
  for (const times of Array.from(byAsset.values())) {
    if (times.length < 2) continue
    times.sort((a: number, b: number) => a - b)
    let gapSum = 0
    for (let i = 1; i < times.length; i++) gapSum += times[i] - times[i - 1]
    perAssetAvg.push(gapSum / (times.length - 1) / DAY_MS)
  }
  if (perAssetAvg.length === 0) return null
  return perAssetAvg.reduce((s, g) => s + g, 0) / perAssetAvg.length
}

/** Sum of actual_cost across rows (nulls treated as 0). */
export function totalMaintenanceCost(rows: WoKpiRow[]): number {
  return rows.reduce((s, r) => s + (Number(r.actual_cost) || 0), 0)
}

/**
 * Active technicians: users with role='technician', not deactivated, that have
 * signed in within `days` (default 30). last_sign_in_at is org-scoped and
 * client-readable on the users table.
 */
export function activeTechnicians(users: TechRow[], days = 30, now: number = Date.now()): number {
  const cutoff = now - days * DAY_MS
  return users.filter(u =>
    u.role === 'technician' &&
    u.is_active !== false &&
    u.last_sign_in_at != null &&
    new Date(u.last_sign_in_at).getTime() >= cutoff,
  ).length
}

export interface SlaBreach {
  wo_number?: string | null
  title?: string | null
  priority?: string | null
  status?: string | null
  dueAt: string | null      // effective deadline (explicit due_at, else created_at + sla_hours)
  resolvedAt: string | null // completed_at, or null if still open
  overdueHours: number      // how far past the deadline (by completion time, or now if open)
}

/** Effective resolution deadline (ms) for a WO: due_at, else created_at + sla_hours. null if neither. */
function deadlineMs(r: WoKpiRow): number | null {
  if (r.due_at) {
    const d = new Date(r.due_at).getTime()
    if (!Number.isNaN(d)) return d
  }
  if (r.created_at && r.sla_hours != null && r.sla_hours > 0) {
    const c = new Date(r.created_at).getTime()
    if (!Number.isNaN(c)) return c + r.sla_hours * HOUR_MS
  }
  return null
}

/**
 * Resolution-SLA breach view. A WO breaches when its effective deadline has
 * passed and it either (a) completed after the deadline, or (b) is still open
 * past the deadline. Deadline = due_at if set, else created_at + sla_hours.
 * WOs with no deadline signal are skipped. Sorted worst-first.
 */
export function slaBreaches(rows: WoKpiRow[], now: number = Date.now()): SlaBreach[] {
  const out: SlaBreach[] = []
  for (const r of rows) {
    const deadline = deadlineMs(r)
    if (deadline == null) continue

    const measuredAt = r.completed_at ? new Date(r.completed_at).getTime() : now
    if (measuredAt <= deadline) continue // met SLA (or not yet breached)

    out.push({
      wo_number: r.wo_number,
      title: r.title,
      priority: r.priority,
      status: r.status,
      dueAt: new Date(deadline).toISOString(),
      resolvedAt: r.completed_at ?? null,
      overdueHours: (measuredAt - deadline) / HOUR_MS,
    })
  }
  return out.sort((a, b) => b.overdueHours - a.overdueHours)
}

/** % of WOs with a deadline that were resolved (or still stand) within SLA. null if none have a deadline. */
export function slaCompliancePercent(rows: WoKpiRow[], now: number = Date.now()): number | null {
  let withDeadline = 0
  let met = 0
  for (const r of rows) {
    const deadline = deadlineMs(r)
    if (deadline == null) continue
    withDeadline++
    const measuredAt = r.completed_at ? new Date(r.completed_at).getTime() : now
    if (measuredAt <= deadline) met++
  }
  if (withDeadline === 0) return null
  return Math.round((met / withDeadline) * 100)
}
