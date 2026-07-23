import { describe, it, expect } from 'vitest'
import { laborFromTimeLogs } from './invoicePrefill'

describe('laborFromTimeLogs', () => {
  it('returns null when nothing is logged', () => {
    expect(laborFromTimeLogs([], 100)).toBeNull()
    expect(laborFromTimeLogs([{ minutes: 0, hourly_rate: 50 }], 100)).toBeNull()
    expect(laborFromTimeLogs([{ minutes: null, hourly_rate: null }], 100)).toBeNull()
  })

  it('sums minutes and uses the snapshotted rate', () => {
    // 90 min @ 100/hr = 150 SAR over 1.5 h → rate 100
    expect(laborFromTimeLogs([{ minutes: 90, hourly_rate: 100 }], 0)).toEqual({ hours: 1.5, rate: 100 })
  })

  it('blends mixed rates into an effective rate', () => {
    // 60 min @ 100 + 60 min @ 50 = 150 SAR over 2 h → 75/hr
    const logs = [
      { minutes: 60, hourly_rate: 100 },
      { minutes: 60, hourly_rate: 50 },
    ]
    expect(laborFromTimeLogs(logs, 0)).toEqual({ hours: 2, rate: 75 })
  })

  it('falls back to the assignee rate for logs without a snapshot', () => {
    // 30 min @ fallback 80 = 40 SAR over 0.5 h → 80/hr
    expect(laborFromTimeLogs([{ minutes: 30, hourly_rate: null }], 80)).toEqual({ hours: 0.5, rate: 80 })
  })
})
