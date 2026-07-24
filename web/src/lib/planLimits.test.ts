import { describe, it, expect } from 'vitest'
import {
  planLimits,
  seatLimitReached,
  siteLimitReached,
  openWorkOrderLimitReached,
  planAllowsApiAccess,
} from './planLimits'

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

describe('siteLimitReached', () => {
  it('blocks only at/over a known numeric cap', () => {
    expect(siteLimitReached('small', 2)).toBe(false)
    expect(siteLimitReached('small', 3)).toBe(true)
    expect(siteLimitReached('medium', 14)).toBe(false)
    expect(siteLimitReached('medium', 15)).toBe(true)
  })
  it('fails open for unlimited tier and unknown/null tier', () => {
    expect(siteLimitReached('enterprise', 9999)).toBe(false)
    expect(siteLimitReached('mystery', 9999)).toBe(false)
    expect(siteLimitReached(null, 9999)).toBe(false)
  })
})

describe('openWorkOrderLimitReached', () => {
  it('blocks only at/over a known numeric cap', () => {
    expect(openWorkOrderLimitReached('small', 199)).toBe(false)
    expect(openWorkOrderLimitReached('small', 200)).toBe(true)
  })
  it('fails open for unlimited tier and unknown/null tier', () => {
    expect(openWorkOrderLimitReached('enterprise', 999999)).toBe(false)
    expect(openWorkOrderLimitReached('mystery', 999999)).toBe(false)
    expect(openWorkOrderLimitReached(null, 999999)).toBe(false)
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
