// FM-29 — work-order total-cost roll-up, mirrored from the WO detail page
// (work-orders/[id]/page.tsx): labor (time logs) + additional costs + parts
// (parsed from the "[ACTIVITY] Parts used: … (SAR n)" comment, the only place
// parts consumption is persisted today).
export type TimeLog = { work_order_id: string; minutes: number | null; hourly_rate: number | null }
export type CostRow = { work_order_id: string; amount: number | null }
export type PartsComment = { work_order_id: string; body: string }

/** Sum labor + parts + additional cost per work_order_id. */
export function woTotalsByWo(
  timeLogs: TimeLog[],
  costs: CostRow[],
  comments: PartsComment[],
): Record<string, number> {
  const totals: Record<string, number> = {}
  const add = (id: string, n: number) => { totals[id] = (totals[id] ?? 0) + n }

  for (const t of timeLogs) {
    if (t.hourly_rate) add(t.work_order_id, ((Number(t.minutes) || 0) / 60) * Number(t.hourly_rate))
  }
  for (const c of costs) add(c.work_order_id, Number(c.amount || 0))
  for (const a of comments) {
    const m = a.body.match(/Parts used:.*\(SAR ([\d.]+)\)/)
    if (m) add(a.work_order_id, parseFloat(m[1]))
  }
  return totals
}
