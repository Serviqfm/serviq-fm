import { describe, it, expect } from 'vitest'
import {
  poTotal, spendByVendor, spendByCategory, spendByCostCenter, spendByMonth,
  cycleTime, vendorPerformance, UNATTRIBUTED,
  type PoForReport, type RequisitionForReport,
} from './procurementReports'

const po = (over: Partial<PoForReport> = {}): PoForReport => ({
  id: 'po-1',
  status: 'received',
  created_at: '2026-03-10T00:00:00Z',
  vendor_name: 'Acme',
  lines: [{ quantity: 10, unit_cost: 100, category: 'HVAC' }],
  ...over,
})

describe('poTotal', () => {
  it('sums quantity × unit cost across lines', () => {
    expect(poTotal(po({ lines: [
      { quantity: 10, unit_cost: 100 },
      { quantity: 4, unit_cost: 25 },
    ] }))).toBe(1100)
  })

  it('survives string numerics and nulls from PostgREST', () => {
    expect(poTotal(po({ lines: [
      { quantity: '3', unit_cost: '10.5' },
      { quantity: null, unit_cost: 99 },
    ] }))).toBe(31.5)
  })

  it('is 0 for an order with no lines', () => {
    expect(poTotal(po({ lines: undefined }))).toBe(0)
  })
})

describe('spendByVendor', () => {
  it('groups and sorts by value descending', () => {
    expect(spendByVendor([
      po({ id: 'a', vendor_name: 'Acme', lines: [{ quantity: 1, unit_cost: 100 }] }),
      po({ id: 'b', vendor_name: 'Bolt', lines: [{ quantity: 1, unit_cost: 300 }] }),
      po({ id: 'c', vendor_name: 'Acme', lines: [{ quantity: 1, unit_cost: 150 }] }),
    ])).toEqual([
      { name: 'Bolt', value: 300 },
      { name: 'Acme', value: 250 },
    ])
  })

  it('excludes cancelled orders — they committed nothing', () => {
    const rows = spendByVendor([
      po({ id: 'a', lines: [{ quantity: 1, unit_cost: 100 }] }),
      po({ id: 'b', status: 'cancelled', lines: [{ quantity: 1, unit_cost: 999 }] }),
    ])
    expect(rows).toEqual([{ name: 'Acme', value: 100 }])
  })

  it('includes drafts — the commitment exists before the order is sent', () => {
    expect(spendByVendor([po({ status: 'draft' })])).toEqual([{ name: 'Acme', value: 1000 }])
  })

  it('buckets a vendorless order rather than dropping it', () => {
    expect(spendByVendor([po({ vendor_name: null })])[0].name).toBe(UNATTRIBUTED)
  })
})

describe('spendByCategory', () => {
  it('splits one order across the categories of its lines', () => {
    expect(spendByCategory([po({ lines: [
      { quantity: 1, unit_cost: 100, category: 'HVAC' },
      { quantity: 2, unit_cost: 100, category: 'Electrical' },
      { quantity: 1, unit_cost: 50, category: 'HVAC' },
    ] })])).toEqual([
      { name: 'Electrical', value: 200 },
      { name: 'HVAC', value: 150 },
    ])
  })

  it('buckets uncategorised lines', () => {
    expect(spendByCategory([po({ lines: [{ quantity: 1, unit_cost: 10 }] })]))
      .toEqual([{ name: UNATTRIBUTED, value: 10 }])
  })
})

describe('spendByCostCenter', () => {
  it('attributes a PO through the requisition it came from', () => {
    const rows = spendByCostCenter(
      [
        po({ id: 'a', requisition_id: 'r1', lines: [{ quantity: 1, unit_cost: 100 }] }),
        po({ id: 'b', requisition_id: 'r2', lines: [{ quantity: 1, unit_cost: 400 }] }),
      ],
      { r1: 'Facilities', r2: 'IT' },
    )
    expect(rows).toEqual([
      { name: 'IT', value: 400 },
      { name: 'Facilities', value: 100 },
    ])
  })

  it('keeps a directly-raised PO visible as unattributed instead of dropping it', () => {
    // Spend by cost center must still sum to total spend, or the chart lies.
    const rows = spendByCostCenter(
      [po({ id: 'a', requisition_id: 'r1', lines: [{ quantity: 1, unit_cost: 100 }] }),
       po({ id: 'b', requisition_id: null, lines: [{ quantity: 1, unit_cost: 60 }] })],
      { r1: 'Facilities' },
    )
    expect(rows.reduce((s, r) => s + r.value, 0)).toBe(160)
    expect(rows.find(r => r.name === UNATTRIBUTED)?.value).toBe(60)
  })
})

describe('spendByMonth', () => {
  it('is ordered chronologically, not by size', () => {
    expect(spendByMonth([
      po({ id: 'a', created_at: '2026-03-02T00:00:00Z', lines: [{ quantity: 1, unit_cost: 10 }] }),
      po({ id: 'b', created_at: '2026-01-20T00:00:00Z', lines: [{ quantity: 1, unit_cost: 500 }] }),
      po({ id: 'c', created_at: '2026-03-28T00:00:00Z', lines: [{ quantity: 1, unit_cost: 90 }] }),
    ])).toEqual([
      { name: '2026-01', value: 500 },
      { name: '2026-03', value: 100 },
    ])
  })
})

describe('cycleTime', () => {
  const reqs: RequisitionForReport[] = [
    { id: 'r1', status: 'converted', created_at: '2026-03-01T00:00:00Z', decided_at: '2026-03-03T00:00:00Z' },
    { id: 'r2', status: 'converted', created_at: '2026-03-01T00:00:00Z', decided_at: '2026-03-05T00:00:00Z' },
  ]

  it('averages each stage over the documents that reached it', () => {
    const c = cycleTime(reqs, [
      po({ id: 'a', requisition_id: 'r1', sent_at: '2026-03-04T00:00:00Z', received_at: '2026-03-09T00:00:00Z' }),
      po({ id: 'b', requisition_id: 'r2', sent_at: '2026-03-06T00:00:00Z', received_at: '2026-03-08T00:00:00Z' }),
    ])
    expect(c.requestToApproval).toBe(3)   // (2 + 4) / 2
    expect(c.approvalToOrder).toBe(1)     // (1 + 1) / 2
    expect(c.orderToDelivery).toBe(3.5)   // (5 + 2) / 2
    expect(c.endToEnd).toBe(7.5)          // (8 + 7) / 2
  })

  it('does NOT count an undecided requisition as a zero-day approval', () => {
    // The trap: averaging a missing timestamp as 0 flatters the number.
    const c = cycleTime([
      ...reqs,
      { id: 'r3', status: 'pending_approval', created_at: '2026-03-01T00:00:00Z', decided_at: null },
    ], [])
    expect(c.requestToApproval).toBe(3)
    expect(c.samples.requestToApproval).toBe(2)
  })

  it('reports null, not 0, when a stage has no data at all', () => {
    const c = cycleTime([], [])
    expect(c).toMatchObject({
      requestToApproval: null, approvalToOrder: null, orderToDelivery: null, endToEnd: null,
    })
  })

  it('counts delivery time for a PO with no requisition behind it', () => {
    const c = cycleTime([], [
      po({ requisition_id: null, sent_at: '2026-03-01T00:00:00Z', received_at: '2026-03-03T00:00:00Z' }),
    ])
    expect(c.orderToDelivery).toBe(2)
    expect(c.approvalToOrder).toBeNull()
  })

  it('ignores negative spans from out-of-order timestamps', () => {
    const c = cycleTime([
      { id: 'r9', status: 'approved', created_at: '2026-03-10T00:00:00Z', decided_at: '2026-03-01T00:00:00Z' },
    ], [])
    expect(c.requestToApproval).toBeNull()
    expect(c.samples.requestToApproval).toBe(0)
  })
})

describe('vendorPerformance', () => {
  it('counts open orders, received orders and on-time percentage per vendor', () => {
    const rows = vendorPerformance([
      po({ id: 'a', vendor_name: 'Acme', status: 'received', expected_at: '2026-03-10', received_at: '2026-03-09T10:00:00Z', lines: [{ quantity: 1, unit_cost: 100 }] }),
      po({ id: 'b', vendor_name: 'Acme', status: 'received', expected_at: '2026-03-10', received_at: '2026-03-15T10:00:00Z', lines: [{ quantity: 1, unit_cost: 100 }] }),
      po({ id: 'c', vendor_name: 'Acme', status: 'in_transit', lines: [{ quantity: 1, unit_cost: 50 }] }),
    ])
    expect(rows).toEqual([
      { vendor: 'Acme', spend: 250, openPos: 1, receivedPos: 2, onTimePercent: 50 },
    ])
  })

  it('treats arrival on the promised day as on time', () => {
    const rows = vendorPerformance([
      po({ status: 'received', expected_at: '2026-03-10', received_at: '2026-03-10T23:00:00Z' }),
    ])
    expect(rows[0].onTimePercent).toBe(100)
  })

  it('reports null rather than 0% when no order can be judged', () => {
    const rows = vendorPerformance([po({ status: 'sent', expected_at: null, received_at: null })])
    expect(rows[0].onTimePercent).toBeNull()
    expect(rows[0].openPos).toBe(1)
  })
})
