// Procurement reporting maths (P6). Pure: every chart on
// /dashboard/procurement/reports is one of these functions applied to rows the
// page fetched, so the numbers can be checked without a browser or a database.
//
// SPEND here means COMMITTED money: the value of purchase orders that were
// actually placed. Cancelled orders are excluded — they committed nothing — and
// draft orders are included, because the commitment exists even before it is
// sent. Requisitions are deliberately NOT counted as spend: an approved
// requisition is an intention, and counting it alongside the PO it becomes would
// double-count the same money (the same trap P5's `reserved` avoids).

export type SpendRow = { name: string; value: number }

export type PoLineForReport = {
  quantity: number | string | null
  unit_cost: number | string | null
  category?: string | null
}

export type PoForReport = {
  id: string
  status: string
  created_at: string
  sent_at?: string | null
  received_at?: string | null
  expected_at?: string | null
  requisition_id?: string | null
  vendor_name?: string | null
  lines?: PoLineForReport[]
}

export type RequisitionForReport = {
  id: string
  created_at: string
  submitted_at?: string | null
  decided_at?: string | null
  status: string
  cost_center_name?: string | null
}

const UNCOMMITTED = ['cancelled']
const num = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const round2 = (n: number) => Math.round(n * 100) / 100

/** Committed value of one purchase order. */
export function poTotal(po: PoForReport): number {
  return round2((po.lines ?? []).reduce((s, l) => s + num(l.quantity) * num(l.unit_cost), 0))
}

export function isCommitted(po: PoForReport): boolean {
  return !UNCOMMITTED.includes(po.status)
}

function group(rows: { key: string; value: number }[]): SpendRow[] {
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(r.key, (totals.get(r.key) ?? 0) + r.value)
  return Array.from(totals)
    .map(([name, value]) => ({ name, value: round2(value) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

export const UNATTRIBUTED = '—'

export function spendByVendor(pos: PoForReport[]): SpendRow[] {
  return group(pos.filter(isCommitted).map(po => ({
    key: po.vendor_name || UNATTRIBUTED,
    value: poTotal(po),
  })))
}

/** Category comes from each LINE's inventory item, so one order can span several. */
export function spendByCategory(pos: PoForReport[]): SpendRow[] {
  const rows: { key: string; value: number }[] = []
  for (const po of pos.filter(isCommitted)) {
    for (const l of po.lines ?? []) {
      rows.push({ key: l.category || UNATTRIBUTED, value: round2(num(l.quantity) * num(l.unit_cost)) })
    }
  }
  return group(rows)
}

/**
 * Spend by cost center. A PO inherits its cost center from the requisition it
 * came from; an order raised directly has none and lands in UNATTRIBUTED rather
 * than being dropped, so the chart always sums to total spend.
 */
export function spendByCostCenter(
  pos: PoForReport[],
  costCenterByRequisition: Record<string, string | null | undefined>
): SpendRow[] {
  return group(pos.filter(isCommitted).map(po => ({
    key: (po.requisition_id ? costCenterByRequisition[po.requisition_id] : null) || UNATTRIBUTED,
    value: poTotal(po),
  })))
}

/** Chronological, not by size — a time series must read left to right. */
export function spendByMonth(pos: PoForReport[]): SpendRow[] {
  const totals = new Map<string, number>()
  for (const po of pos.filter(isCommitted)) {
    const month = String(po.created_at ?? '').slice(0, 7)
    if (month.length !== 7) continue
    totals.set(month, (totals.get(month) ?? 0) + poTotal(po))
  }
  return Array.from(totals)
    .map(([name, value]) => ({ name, value: round2(value) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function daysBetween(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return (b - a) / 86400000
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10
}

export type CycleTime = {
  /** Raised to decided. */
  requestToApproval: number | null
  /** Decided to the order leaving for the vendor. */
  approvalToOrder: number | null
  /** Order sent to goods received. */
  orderToDelivery: number | null
  /** Requisition raised to goods received, for the chains that completed. */
  endToEnd: number | null
  /** How many documents each stage was averaged over — an average of one is not a trend. */
  samples: { requestToApproval: number; approvalToOrder: number; orderToDelivery: number; endToEnd: number }
}

/**
 * Average days per stage. Every stage counts ONLY the documents that actually
 * have both timestamps: a requisition still awaiting approval has no approval
 * date and must not be averaged in as zero, which would flatter the number.
 */
export function cycleTime(reqs: RequisitionForReport[], pos: PoForReport[]): CycleTime {
  const reqById = new Map(reqs.map(r => [r.id, r]))

  const toApproval: number[] = []
  for (const r of reqs) {
    const d = daysBetween(r.created_at, r.decided_at)
    if (d !== null && d >= 0) toApproval.push(d)
  }

  const toOrder: number[] = []
  const toDelivery: number[] = []
  const endToEnd: number[] = []
  for (const po of pos) {
    const d = daysBetween(po.sent_at, po.received_at)
    if (d !== null && d >= 0) toDelivery.push(d)

    const req = po.requisition_id ? reqById.get(po.requisition_id) : undefined
    if (!req) continue
    const approvalToSent = daysBetween(req.decided_at, po.sent_at)
    if (approvalToSent !== null && approvalToSent >= 0) toOrder.push(approvalToSent)
    const whole = daysBetween(req.created_at, po.received_at)
    if (whole !== null && whole >= 0) endToEnd.push(whole)
  }

  return {
    requestToApproval: average(toApproval),
    approvalToOrder: average(toOrder),
    orderToDelivery: average(toDelivery),
    endToEnd: average(endToEnd),
    samples: {
      requestToApproval: toApproval.length,
      approvalToOrder: toOrder.length,
      orderToDelivery: toDelivery.length,
      endToEnd: endToEnd.length,
    },
  }
}

export type VendorPerformanceRow = {
  vendor: string
  spend: number
  openPos: number
  receivedPos: number
  onTimePercent: number | null
}

/**
 * One row per vendor. onTimePercent reuses the P2 definition: only orders that
 * both landed AND carried a promised date can be judged, so an unjudgeable
 * order is excluded from both halves rather than counted as a miss (null means
 * "nothing to judge yet", which is not the same as 0%).
 */
export function vendorPerformance(pos: PoForReport[]): VendorPerformanceRow[] {
  const byVendor = new Map<string, PoForReport[]>()
  for (const po of pos.filter(isCommitted)) {
    const key = po.vendor_name || UNATTRIBUTED
    byVendor.set(key, [...(byVendor.get(key) ?? []), po])
  }

  return Array.from(byVendor)
    .map(([vendor, list]) => {
      const judged = list.filter(p => p.expected_at && p.received_at)
      const onTime = judged.filter(
        p => new Date(p.received_at as string) <= new Date(`${p.expected_at as string}T23:59:59.999Z`)
      ).length
      return {
        vendor,
        spend: round2(list.reduce((s, p) => s + poTotal(p), 0)),
        openPos: list.filter(p => ['draft', 'sent', 'acknowledged', 'in_transit'].includes(p.status)).length,
        receivedPos: list.filter(p => p.status === 'received').length,
        onTimePercent: judged.length === 0 ? null : Math.round((onTime / judged.length) * 100),
      }
    })
    .sort((a, b) => b.spend - a.spend || a.vendor.localeCompare(b.vendor))
}
