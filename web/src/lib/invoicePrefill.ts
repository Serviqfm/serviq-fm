// WO-06 — client-invoice labor prefill from work_order_time_logs.
export type TimeLogRow = { minutes: number | null; hourly_rate: number | null }

/**
 * Labor cost = Σ minutes/60 × snapshotted hourly_rate (fallbackRate when a log
 * has none). Returned as hours + effective rate so the existing hours×rate form
 * fields stay editable (prefill, not lock). Null when nothing is logged.
 */
export function laborFromTimeLogs(
  logs: TimeLogRow[],
  fallbackRate: number
): { hours: number; rate: number } | null {
  const totalMin = logs.reduce((s, t) => s + (Number(t.minutes) || 0), 0)
  if (totalMin <= 0) return null
  const cost = logs.reduce(
    (s, t) =>
      s + ((Number(t.minutes) || 0) / 60) * (t.hourly_rate == null ? fallbackRate : Number(t.hourly_rate)),
    0
  )
  // Derive the rate from the ROUNDED hours the form will actually store, so
  // hours × rate reproduces the true logged cost to within hours×0.005 (sub-cent
  // for typical jobs) instead of rate×0.005. (totalMin is an integer ≥ 1, so
  // rounded hours ≥ 0.02 — never zero.)
  const hours = parseFloat((totalMin / 60).toFixed(2))
  return {
    hours,
    rate: parseFloat((cost / hours).toFixed(2)),
  }
}
