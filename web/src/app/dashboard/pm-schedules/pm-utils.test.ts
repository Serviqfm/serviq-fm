import { describe, it, expect, vi } from 'vitest'
import { isMonthInSeasonalWindow, nextSeasonStart, applySeasonalWindow, addMonths, rollByInterval, rollNextDue, setPmScheduleActive, clearOpenGeneratedWorkOrders, PAUSE_CLEARABLE_STATUSES, DELETE_CLEARABLE_STATUSES } from './pm-utils'

// Minimal supabase stub: records the last delete/update chain so we can assert the
// filters and payloads the lifecycle helpers build.
function fakeDb() {
  const calls: { table: string; op: string; eq: Record<string, unknown>; in: Record<string, unknown[]>; payload?: unknown }[] = []
  function chain(table: string, op: string, payload?: unknown) {
    const rec = { table, op, eq: {} as Record<string, unknown>, in: {} as Record<string, unknown[]>, payload }
    calls.push(rec)
    const api = {
      eq: (k: string, v: unknown) => { rec.eq[k] = v; return api },
      in: (k: string, v: unknown[]) => { rec.in[k] = v; return api },
    }
    return api
  }
  const db = {
    from: (table: string) => ({
      delete: () => chain(table, 'delete'),
      update: (payload: unknown) => chain(table, 'update', payload),
    }),
  }
  return { db, calls }
}

describe('addMonths (true calendar, day clamped)', () => {
  it('Jan 31 + 1 month clamps to Feb 28 (non-leap)', () => {
    expect(addMonths(new Date('2026-01-31T09:00:00Z'), 1).toISOString()).toBe('2026-02-28T09:00:00.000Z')
  })
  it('Jan 31 + 1 month clamps to Feb 29 (leap year)', () => {
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })
  it('crosses the year boundary', () => {
    expect(addMonths(new Date('2026-11-15T00:00:00Z'), 3).toISOString()).toBe('2027-02-15T00:00:00.000Z')
  })
})

describe('rollByInterval (1C-10)', () => {
  it('returns null when not fully specified', () => {
    expect(rollByInterval(new Date('2026-01-01Z'), {})).toBeNull()
    expect(rollByInterval(new Date('2026-01-01Z'), { interval_count: 0, interval_unit: 'day' })).toBeNull()
  })
  it('every 2 months advances two real calendar months', () => {
    expect(rollByInterval(new Date('2026-01-15T00:00:00Z'), { interval_count: 2, interval_unit: 'month' })!.toISOString())
      .toBe('2026-03-15T00:00:00.000Z')
  })
  it('anchors day-of-month to the 1st across month lengths', () => {
    expect(rollByInterval(new Date('2026-01-31T00:00:00Z'), { interval_count: 1, interval_unit: 'month', anchor_day: 1 })!.toISOString())
      .toBe('2026-02-01T00:00:00.000Z')
  })
  it('anchor_day clamps to month length (31 -> Feb 28)', () => {
    expect(rollByInterval(new Date('2026-01-15T00:00:00Z'), { interval_count: 1, interval_unit: 'month', anchor_day: 31 })!.toISOString())
      .toBe('2026-02-28T00:00:00.000Z')
  })
  it('week and year units', () => {
    expect(rollByInterval(new Date('2026-01-01T00:00:00Z'), { interval_count: 2, interval_unit: 'week' })!.toISOString())
      .toBe('2026-01-15T00:00:00.000Z')
    expect(rollByInterval(new Date('2026-01-01T00:00:00Z'), { interval_count: 1, interval_unit: 'year' })!.toISOString())
      .toBe('2027-01-01T00:00:00.000Z')
  })
})

describe('rollNextDue precedence', () => {
  it('interval config overrides the frequency preset', () => {
    expect(rollNextDue(new Date('2026-01-15T00:00:00Z'), 'monthly', null, { interval_count: 2, interval_unit: 'month' }).toISOString())
      .toBe('2026-03-15T00:00:00.000Z')
  })
  it('falls back to the frequency preset when no interval config', () => {
    // monthly preset = +30 days
    expect(rollNextDue(new Date('2026-01-01T00:00:00Z'), 'monthly').toISOString())
      .toBe('2026-01-31T00:00:00.000Z')
  })
})

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

describe('clearOpenGeneratedWorkOrders (1C-16/1C-17)', () => {
  it('filters by pm_schedule_id, source, and the given open statuses', async () => {
    const { db, calls } = fakeDb()
    await clearOpenGeneratedWorkOrders(db, 'sched-1', DELETE_CLEARABLE_STATUSES)
    expect(calls).toHaveLength(1)
    const c = calls[0]
    expect(c.table).toBe('work_orders')
    expect(c.op).toBe('delete')
    expect(c.in['pm_schedule_id']).toEqual(['sched-1'])
    expect(c.eq['source']).toBe('pm_schedule')
    expect(c.in['status']).toEqual(['new', 'assigned', 'in_progress'])
  })
  it('accepts an array of ids for bulk delete', async () => {
    const { db, calls } = fakeDb()
    await clearOpenGeneratedWorkOrders(db, ['a', 'b'], PAUSE_CLEARABLE_STATUSES)
    expect(calls[0].in['pm_schedule_id']).toEqual(['a', 'b'])
    expect(calls[0].in['status']).toEqual(['new', 'assigned'])
  })
  it('is a no-op with no ids (does not issue a delete)', async () => {
    const { db, calls } = fakeDb()
    await clearOpenGeneratedWorkOrders(db, [], PAUSE_CLEARABLE_STATUSES)
    expect(calls).toHaveLength(0)
  })
})

describe('setPmScheduleActive (1C-16)', () => {
  it('pause clears never-started WOs then sets is_active=false (no next_due_at change)', async () => {
    const { db, calls } = fakeDb()
    await setPmScheduleActive(db, { id: 's1', frequency: 'monthly' }, false)
    // 1st call: delete open new/assigned WOs; 2nd: update is_active=false
    expect(calls[0]).toMatchObject({ table: 'work_orders', op: 'delete' })
    expect(calls[0].in['status']).toEqual(['new', 'assigned'])
    expect(calls[1]).toMatchObject({ table: 'pm_schedules', op: 'update' })
    expect(calls[1].payload).toEqual({ is_active: false })
    expect(calls[1].eq['id']).toBe('s1')
  })
  it('resume rebaselines next_due_at forward from now and does not delete WOs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-01T00:00:00Z'))
    const { db, calls } = fakeDb()
    await setPmScheduleActive(db, { id: 's1', frequency: 'monthly' }, true)
    vi.useRealTimers()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ table: 'pm_schedules', op: 'update' })
    const payload = calls[0].payload as { is_active: boolean; next_due_at: string }
    expect(payload.is_active).toBe(true)
    // monthly preset = +30 days from now
    expect(payload.next_due_at).toBe('2026-07-31T00:00:00.000Z')
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
