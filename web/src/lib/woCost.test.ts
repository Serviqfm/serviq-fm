import { describe, it, expect } from 'vitest'
import { woTotalsByWo } from './woCost'

describe('woTotalsByWo', () => {
  it('sums labor + parts + additional cost per work order', () => {
    const totals = woTotalsByWo(
      [{ work_order_id: 'a', minutes: 90, hourly_rate: 100 }], // 1.5h @ 100 = 150
      [{ work_order_id: 'a', amount: 50 }],                    // +50
      [{ work_order_id: 'a', body: '[ACTIVITY] Parts used: 2 x Filter (SAR 30.00)' }], // +30
    )
    expect(totals.a).toBeCloseTo(230)
  })

  it('ignores labor with no rate and non-parts comments; keys per WO', () => {
    const totals = woTotalsByWo(
      [{ work_order_id: 'b', minutes: 60, hourly_rate: null }],
      [{ work_order_id: 'c', amount: 10 }],
      [{ work_order_id: 'b', body: '[ACTIVITY] Status changed' }],
    )
    expect(totals.b ?? 0).toBe(0)
    expect(totals.c).toBe(10)
  })
})
