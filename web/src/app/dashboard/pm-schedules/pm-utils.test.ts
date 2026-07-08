import { describe, it, expect } from 'vitest'
import { isMonthInSeasonalWindow, nextSeasonStart, applySeasonalWindow } from './pm-utils'

describe('isMonthInSeasonalWindow', () => {
  it('handles a normal (non-wrapping) window May–Sep', () => {
    for (const m of [5, 6, 7, 8, 9]) expect(isMonthInSeasonalWindow(m, 5, 9)).toBe(true)
    for (const m of [1, 4, 10, 12]) expect(isMonthInSeasonalWindow(m, 5, 9)).toBe(false)
  })
  it('handles a wrap-around window Oct–Apr', () => {
    for (const m of [10, 11, 12, 1, 2, 3, 4]) expect(isMonthInSeasonalWindow(m, 10, 4)).toBe(true)
    for (const m of [5, 6, 7, 8, 9]) expect(isMonthInSeasonalWindow(m, 10, 4)).toBe(false)
  })
})

describe('nextSeasonStart', () => {
  it('rolls to next year when start month is behind the date', () => {
    // Oct 2026, resume in May -> May 2027
    expect(nextSeasonStart(new Date('2026-10-15T10:00:00Z'), 5).toISOString()).toBe('2027-05-01T00:00:00.000Z')
  })
  it('stays in the same year when start month is ahead', () => {
    // Mar 2026, resume in May -> May 2026
    expect(nextSeasonStart(new Date('2026-03-10T00:00:00Z'), 5).toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })
})

describe('applySeasonalWindow', () => {
  it('passes through an in-window date unchanged', () => {
    const d = new Date('2026-07-01T00:00:00Z')
    expect(applySeasonalWindow(d, true, 5, 9).toISOString()).toBe(d.toISOString())
  })
  it('resumes an out-of-window date at the next season start', () => {
    // Oct due date on a May–Sep schedule resumes next May
    expect(applySeasonalWindow(new Date('2026-10-05T00:00:00Z'), true, 5, 9).toISOString())
      .toBe('2027-05-01T00:00:00.000Z')
  })
  it('is a no-op for non-seasonal schedules', () => {
    const d = new Date('2026-12-25T00:00:00Z')
    expect(applySeasonalWindow(d, false, 5, 9).toISOString()).toBe(d.toISOString())
    expect(applySeasonalWindow(d, true, null, 9).toISOString()).toBe(d.toISOString())
  })
})
