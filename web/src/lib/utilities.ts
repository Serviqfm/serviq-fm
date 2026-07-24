// FM-28 / MKT-24 — utility consumption roll-up. Readings are cumulative meter
// values; consumption for a period is the delta between consecutive readings on
// the same account, and cost = consumption × tariff_per_unit. Pure so the
// dashboard math is unit-tested (utilities.test.ts) without a DB.

export type Reading = {
  account_id: string
  reading_value: number | string
  period_start: string   // ISO date
  period_end: string     // ISO date
}

export type Period = {
  period_start: string
  period_end: string
  consumption: number    // units used in this interval
  cost: number           // consumption × tariff
}

/**
 * Delta-based periods for one account's readings.
 * Readings need not be pre-sorted. The first (earliest) reading is the baseline
 * and yields no period. A meter reset (value drops below the prior reading)
 * clamps that interval's consumption to 0 rather than emitting a negative.
 */
export function accountPeriods(readings: Reading[], tariffPerUnit: number): Period[] {
  const sorted = [...readings].sort((a, b) => a.period_start.localeCompare(b.period_start))
  const out: Period[] = []
  for (let i = 1; i < sorted.length; i++) {
    const consumption = Math.max(0, Number(sorted[i].reading_value) - Number(sorted[i - 1].reading_value))
    out.push({
      period_start: sorted[i].period_start,
      period_end: sorted[i].period_end,
      consumption,
      cost: consumption * (Number(tariffPerUnit) || 0),
    })
  }
  return out
}
