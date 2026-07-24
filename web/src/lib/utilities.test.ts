import { describe, it, expect } from 'vitest'
import { accountPeriods } from './utilities'

describe('accountPeriods', () => {
  it('deltas consecutive readings and prices them by tariff', () => {
    const periods = accountPeriods([
      { account_id: 'a', reading_value: 100, period_start: '2026-01-01', period_end: '2026-01-31' },
      { account_id: 'a', reading_value: 250, period_start: '2026-02-01', period_end: '2026-02-28' },
      { account_id: 'a', reading_value: 400, period_start: '2026-03-01', period_end: '2026-03-31' },
    ], 0.5)
    expect(periods).toHaveLength(2)            // baseline yields no period
    expect(periods[0].consumption).toBe(150)
    expect(periods[0].cost).toBeCloseTo(75)    // 150 × 0.5
    expect(periods[1].consumption).toBe(150)
  })

  it('sorts unordered readings and clamps a meter reset to 0', () => {
    const periods = accountPeriods([
      { account_id: 'a', reading_value: 90, period_start: '2026-02-01', period_end: '2026-02-28' }, // reset
      { account_id: 'a', reading_value: 100, period_start: '2026-01-01', period_end: '2026-01-31' },
    ], 2)
    expect(periods[0].consumption).toBe(0)
    expect(periods[0].cost).toBe(0)
  })
})
