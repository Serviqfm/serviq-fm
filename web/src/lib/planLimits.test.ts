import { describe, it, expect } from 'vitest'
import { planLimits, seatLimitReached, planAllowsApiAccess } from './planLimits'

describe('planLimits', () => {
  it('returns null for unknown/null tier (fail open)', () => {
    expect(planLimits(null)).toBeNull()
    expect(planLimits(undefined)).toBeNull()
    expect(planLimits('free')).toBeNull()
  })
})

describe('seatLimitReached', () => {
  it('blocks only at/over a known numeric cap', () => {
    expect(seatLimitReached('small', 9)).toBe(false)
    expect(seatLimitReached('small', 10)).toBe(true)
    expect(seatLimitReached('small', 11)).toBe(true)
  })
  it('fails open for unlimited tier and unknown/null tier', () => {
    expect(seatLimitReached('enterprise', 9999)).toBe(false)
    expect(seatLimitReached('mystery', 9999)).toBe(false)
    expect(seatLimitReached(null, 9999)).toBe(false)
  })
})

describe('planAllowsApiAccess', () => {
  it('gates per tier and fails open on unknown/null', () => {
    expect(planAllowsApiAccess('small')).toBe(false)
    expect(planAllowsApiAccess('medium')).toBe(true)
    expect(planAllowsApiAccess('enterprise')).toBe(true)
    expect(planAllowsApiAccess('mystery')).toBe(true)
    expect(planAllowsApiAccess(null)).toBe(true)
  })
})
