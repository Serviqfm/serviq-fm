// The 3-way match (P4). Pure — no DB, no fetch, no dates — so the rule that
// decides whether money goes out the door can be tested exhaustively.
//
// Three documents, three checks:
//   1. po_invoice   — are we being billed the agreed price, for no more than we ordered?
//   2. gr_invoice   — are we being billed only for what actually arrived and passed
//                     inspection? (cumulative OK goods-receipt quantity, per P3)
//   3. totals       — does the invoice header total agree with its own lines?
//
// Any failing check makes the whole match a mismatch. Every failure carries the
// numbers behind it, so the UI can show the exact delta rather than "mismatch".

/** Quantities must agree exactly; money is allowed to drift by this much (rounding, FX, fees). */
export const AMOUNT_TOLERANCE_PERCENT = 1

export type PoLine = {
  id: string
  description?: string | null
  quantity: number
  unit_cost: number
}

export type InvoiceLine = {
  id?: string
  purchase_order_item_id?: string | null
  description?: string | null
  quantity: number
  unit_price: number
}

export type MatchInput = {
  poLines: PoLine[]
  /** Cumulative OK goods-receipt quantity, keyed by purchase_order_item_id. */
  receivedByPoLine: Record<string, number>
  invoiceLines: InvoiceLine[]
  /** The invoice header amount, which is what actually gets paid. */
  invoiceTotal: number
  amountTolerancePercent?: number
}

export type CheckKey = 'po_invoice' | 'gr_invoice' | 'totals'

export type Issue = {
  /** Human-facing label for the line the issue is on ('Invoice total' for header issues). */
  label: string
  kind: 'price' | 'quantity' | 'total' | 'unlinked'
  expected: number
  actual: number
  /** actual - expected. Positive means the vendor billed us MORE than expected. */
  delta: number
}

export type Check = { key: CheckKey; pass: boolean; issues: Issue[] }

export type MatchResult = {
  status: 'matched' | 'mismatch'
  checks: Check[]
  /** Convenience for the UI/notifications; equals the sum of every check's issues. */
  issueCount: number
  matchedAt: string | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Within tolerance as a PERCENTAGE OF THE EXPECTED value; an expected 0 must be met exactly. */
function withinTolerance(expected: number, actual: number, percent: number): boolean {
  if (expected === actual) return true
  if (expected === 0) return false
  return Math.abs(actual - expected) <= Math.abs(expected) * (percent / 100)
}

function labelFor(line: InvoiceLine, po?: PoLine): string {
  return line.description || po?.description || 'Line'
}

export function threeWayMatch(input: MatchInput): MatchResult {
  const tolerance = input.amountTolerancePercent ?? AMOUNT_TOLERANCE_PERCENT
  const poById = new Map(input.poLines.map(l => [l.id, l]))

  const poInvoice: Issue[] = []
  const grInvoice: Issue[] = []
  const totals: Issue[] = []

  // Invoice lines can bill the same PO line more than once (a second invoice for
  // a second delivery), so quantities accumulate before being judged.
  const billedByPoLine = new Map<string, number>()

  for (const line of input.invoiceLines) {
    const poLineId = line.purchase_order_item_id ?? null
    const po = poLineId ? poById.get(poLineId) : undefined

    if (!po) {
      // Nothing to compare against: billed for something never ordered.
      poInvoice.push({
        label: labelFor(line),
        kind: 'unlinked',
        expected: 0,
        actual: round2(line.quantity * line.unit_price),
        delta: round2(line.quantity * line.unit_price),
      })
      continue
    }

    if (!withinTolerance(po.unit_cost, line.unit_price, tolerance)) {
      poInvoice.push({
        label: labelFor(line, po),
        kind: 'price',
        expected: po.unit_cost,
        actual: line.unit_price,
        delta: round2(line.unit_price - po.unit_cost),
      })
    }

    billedByPoLine.set(poLineId!, (billedByPoLine.get(poLineId!) ?? 0) + line.quantity)
  }

  // Quantity checks run on the accumulated totals, not line by line.
  for (const [poLineId, billed] of Array.from(billedByPoLine)) {
    const po = poById.get(poLineId)!
    const label = po.description || 'Line'

    if (billed > po.quantity) {
      poInvoice.push({
        label, kind: 'quantity',
        expected: po.quantity, actual: billed, delta: round2(billed - po.quantity),
      })
    }

    const received = input.receivedByPoLine[poLineId] ?? 0
    if (billed > received) {
      grInvoice.push({
        label, kind: 'quantity',
        expected: received, actual: billed, delta: round2(billed - received),
      })
    }
  }

  // Header total vs the sum of the lines it is made of.
  const lineSum = round2(input.invoiceLines.reduce((s, l) => s + l.quantity * l.unit_price, 0))
  if (!withinTolerance(lineSum, input.invoiceTotal, tolerance)) {
    totals.push({
      label: 'Invoice total',
      kind: 'total',
      expected: lineSum,
      actual: round2(input.invoiceTotal),
      delta: round2(input.invoiceTotal - lineSum),
    })
  }

  const checks: Check[] = [
    { key: 'po_invoice', pass: poInvoice.length === 0, issues: poInvoice },
    { key: 'gr_invoice', pass: grInvoice.length === 0, issues: grInvoice },
    { key: 'totals', pass: totals.length === 0, issues: totals },
  ]
  const issueCount = checks.reduce((n, c) => n + c.issues.length, 0)

  return {
    status: issueCount === 0 ? 'matched' : 'mismatch',
    checks,
    issueCount,
    matchedAt: null,
  }
}
