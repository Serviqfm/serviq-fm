import { describe, it, expect } from 'vitest'
import { slaDueDates, slaTransitionPatch } from './sla'

const NOW = Date.parse('2026-07-20T00:00:00Z')

describe('slaDueDates', () => {
  it('offsets now by response/resolution minutes', () => {
    expect(slaDueDates({ response_minutes: 30, resolution_minutes: 240 }, NOW)).toEqual({
      sla_response_due_at: new Date(NOW + 30 * 60_000).toISOString(),
      due_at: new Date(NOW + 240 * 60_000).toISOString(),
    })
  })
  it('yields null for absent/non-positive targets and null policy', () => {
    expect(slaDueDates({ response_minutes: null, resolution_minutes: 0 }, NOW)).toEqual({
      sla_response_due_at: null, due_at: null,
    })
    expect(slaDueDates(null, NOW)).toEqual({ sla_response_due_at: null, due_at: null })
  })
})

describe('slaTransitionPatch', () => {
  const base = { firstResponseAt: null, slaPausedAt: null, slaPausedTotalMinutes: 0, nowMs: NOW }

  it('stamps first_response_at on first entry into in_progress', () => {
    expect(slaTransitionPatch({ ...base, prevStatus: 'assigned', newStatus: 'in_progress' }))
      .toEqual({ first_response_at: new Date(NOW).toISOString() })
  })
  it('does not re-stamp first_response_at when already set', () => {
    expect(slaTransitionPatch({ ...base, prevStatus: 'on_hold', newStatus: 'in_progress', firstResponseAt: 'x' }))
      .toEqual({})
  })
  it('starts the pause clock on entering on_hold', () => {
    expect(slaTransitionPatch({ ...base, prevStatus: 'in_progress', newStatus: 'on_hold' }))
      .toEqual({ sla_paused_at: new Date(NOW).toISOString() })
  })
  it('banks elapsed paused minutes and clears the marker on leaving on_hold', () => {
    const pausedAt = new Date(NOW - 45 * 60_000).toISOString()
    expect(slaTransitionPatch({ ...base, prevStatus: 'on_hold', newStatus: 'in_progress', firstResponseAt: 'x', slaPausedAt: pausedAt, slaPausedTotalMinutes: 10 }))
      .toEqual({ sla_paused_total_minutes: 55, sla_paused_at: null })
  })
  it('is a no-op for unrelated transitions', () => {
    expect(slaTransitionPatch({ ...base, prevStatus: 'new', newStatus: 'assigned' })).toEqual({})
  })
})
