import { describe, it, expect } from 'vitest'
import { threeWayMatch, AMOUNT_TOLERANCE_PERCENT, type MatchInput } from './threeWayMatch'

// A PO for 10 widgets at 100 and 4 gaskets at 25, all received OK, invoiced
// exactly as ordered. Every scenario below is this base with one thing changed.
const PO_LINES = [
  { id: 'po-1', description: 'Widget', quantity: 10, unit_cost: 100 },
  { id: 'po-2', description: 'Gasket', quantity: 4, unit_cost: 25 },
]

function base(overrides: Partial<MatchInput> = {}): MatchInput {
  return {
    poLines: PO_LINES,
    receivedByPoLine: { 'po-1': 10, 'po-2': 4 },
    invoiceLines: [
      { purchase_order_item_id: 'po-1', description: 'Widget', quantity: 10, unit_price: 100 },
      { purchase_order_item_id: 'po-2', description: 'Gasket', quantity: 4, unit_price: 25 },
    ],
    invoiceTotal: 1100,
    ...overrides,
  }
}

const check = (r: ReturnType<typeof threeWayMatch>, key: string) =>
  r.checks.find(c => c.key === key)!

describe('threeWayMatch — the clean case', () => {
  it('passes all three checks', () => {
    const r = threeWayMatch(base())
    expect(r.status).toBe('matched')
    expect(r.issueCount).toBe(0)
    expect(r.checks.every(c => c.pass)).toBe(true)
  })

  it('reports exactly three checks, in a stable order', () => {
    expect(threeWayMatch(base()).checks.map(c => c.key))
      .toEqual(['po_invoice', 'gr_invoice', 'totals'])
  })
})

describe('gr_invoice — billed for more than arrived', () => {
  it('flags the exact delta when invoice qty exceeds received qty', () => {
    // The playbook acceptance case: 10 billed, only 6 received OK.
    const r = threeWayMatch(base({
      receivedByPoLine: { 'po-1': 6, 'po-2': 4 },
    }))
    expect(r.status).toBe('mismatch')
    const gr = check(r, 'gr_invoice')
    expect(gr.pass).toBe(false)
    expect(gr.issues).toEqual([
      { label: 'Widget', kind: 'quantity', expected: 6, actual: 10, delta: 4 },
    ])
  })

  it('flags a line that was never received at all', () => {
    const gr = check(threeWayMatch(base({ receivedByPoLine: {} })), 'gr_invoice')
    expect(gr.issues.map(i => [i.label, i.expected, i.actual, i.delta])).toEqual([
      ['Widget', 0, 10, 10],
      ['Gasket', 0, 4, 4],
    ])
  })

  it('does NOT flag being billed for less than arrived (under-billing is fine)', () => {
    const r = threeWayMatch(base({
      invoiceLines: [{ purchase_order_item_id: 'po-1', quantity: 3, unit_price: 100 }],
      invoiceTotal: 300,
    }))
    expect(check(r, 'gr_invoice').pass).toBe(true)
    expect(r.status).toBe('matched')
  })
})

describe('po_invoice — price and quantity against the order', () => {
  it('flags a unit price above tolerance with the delta', () => {
    const r = threeWayMatch(base({
      invoiceLines: [
        { purchase_order_item_id: 'po-1', description: 'Widget', quantity: 10, unit_price: 110 },
        { purchase_order_item_id: 'po-2', description: 'Gasket', quantity: 4, unit_price: 25 },
      ],
      invoiceTotal: 1200,
    }))
    const po = check(r, 'po_invoice')
    expect(po.pass).toBe(false)
    expect(po.issues).toContainEqual(
      { label: 'Widget', kind: 'price', expected: 100, actual: 110, delta: 10 }
    )
  })

  it('accepts a price inside the 1% tolerance and rejects just outside it', () => {
    const at = (unit_price: number) => threeWayMatch(base({
      invoiceLines: [{ purchase_order_item_id: 'po-1', quantity: 10, unit_price }],
      invoiceTotal: 10 * unit_price,
    }))
    expect(AMOUNT_TOLERANCE_PERCENT).toBe(1)
    expect(check(at(101), 'po_invoice').pass).toBe(true)    // exactly +1%
    expect(check(at(99), 'po_invoice').pass).toBe(true)     // exactly -1%
    expect(check(at(101.5), 'po_invoice').pass).toBe(false) // outside
  })

  it('honours a custom tolerance', () => {
    const r = threeWayMatch(base({
      invoiceLines: [{ purchase_order_item_id: 'po-1', quantity: 10, unit_price: 105 }],
      invoiceTotal: 1050,
      amountTolerancePercent: 10,
    }))
    expect(check(r, 'po_invoice').pass).toBe(true)
  })

  it('flags being billed for more units than were ordered', () => {
    const r = threeWayMatch(base({
      receivedByPoLine: { 'po-1': 12, 'po-2': 4 },
      invoiceLines: [{ purchase_order_item_id: 'po-1', description: 'Widget', quantity: 12, unit_price: 100 }],
      invoiceTotal: 1200,
    }))
    expect(check(r, 'po_invoice').issues).toContainEqual(
      { label: 'Widget', kind: 'quantity', expected: 10, actual: 12, delta: 2 }
    )
  })

  it('flags an invoice line that maps to no PO line at all', () => {
    const r = threeWayMatch(base({
      invoiceLines: [
        ...base().invoiceLines,
        { purchase_order_item_id: null, description: 'Delivery fee', quantity: 1, unit_price: 50 },
      ],
      invoiceTotal: 1150,
    }))
    const po = check(r, 'po_invoice')
    expect(po.issues).toContainEqual(
      { label: 'Delivery fee', kind: 'unlinked', expected: 0, actual: 50, delta: 50 }
    )
  })

  it('accumulates quantity across several invoice lines hitting the same PO line', () => {
    // 6 + 6 = 12 billed against an order of 10, and only 10 received.
    const r = threeWayMatch(base({
      invoiceLines: [
        { purchase_order_item_id: 'po-1', description: 'Widget', quantity: 6, unit_price: 100 },
        { purchase_order_item_id: 'po-1', description: 'Widget', quantity: 6, unit_price: 100 },
      ],
      invoiceTotal: 1200,
    }))
    expect(check(r, 'po_invoice').issues).toContainEqual(
      { label: 'Widget', kind: 'quantity', expected: 10, actual: 12, delta: 2 }
    )
    expect(check(r, 'gr_invoice').issues).toContainEqual(
      { label: 'Widget', kind: 'quantity', expected: 10, actual: 12, delta: 2 }
    )
  })
})

describe('totals — header against its own lines', () => {
  it('flags a header total that does not match the lines', () => {
    const r = threeWayMatch(base({ invoiceTotal: 1500 }))
    expect(check(r, 'totals').issues).toEqual([
      { label: 'Invoice total', kind: 'total', expected: 1100, actual: 1500, delta: 400 },
    ])
  })

  it('tolerates rounding inside 1% and reports a negative delta when billed less', () => {
    expect(check(threeWayMatch(base({ invoiceTotal: 1105 })), 'totals').pass).toBe(true)
    const under = check(threeWayMatch(base({ invoiceTotal: 900 })), 'totals')
    expect(under.issues[0].delta).toBe(-200)
  })

  it('requires an exact match when the lines sum to zero', () => {
    const r = threeWayMatch({
      poLines: [], receivedByPoLine: {}, invoiceLines: [], invoiceTotal: 50,
    })
    expect(check(r, 'totals').pass).toBe(false)
    expect(check(r, 'totals').issues[0]).toEqual(
      { label: 'Invoice total', kind: 'total', expected: 0, actual: 50, delta: 50 }
    )
  })
})

describe('threeWayMatch — edges', () => {
  it('an empty invoice against an empty PO matches', () => {
    const r = threeWayMatch({ poLines: [], receivedByPoLine: {}, invoiceLines: [], invoiceTotal: 0 })
    expect(r.status).toBe('matched')
  })

  it('a single failing check is enough to make the whole match a mismatch', () => {
    const r = threeWayMatch(base({ receivedByPoLine: { 'po-1': 9, 'po-2': 4 } }))
    expect(r.status).toBe('mismatch')
    expect(check(r, 'po_invoice').pass).toBe(true)
    expect(check(r, 'totals').pass).toBe(true)
    expect(r.issueCount).toBe(1)
  })

  it('rounds money deltas to two places instead of leaking float noise', () => {
    const r = threeWayMatch(base({
      invoiceLines: [{ purchase_order_item_id: 'po-1', quantity: 3, unit_price: 0.1 }],
      invoiceTotal: 0.7,
    }))
    // 3 * 0.1 = 0.30000000000000004 in IEEE 754.
    expect(check(r, 'totals').issues[0].expected).toBe(0.3)
    expect(check(r, 'totals').issues[0].delta).toBe(0.4)
  })
})
