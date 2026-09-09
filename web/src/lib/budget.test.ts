import { describe, it, expect } from 'vitest'
import { parseBudgetError, budgetUsage } from './budget'

describe('parseBudgetError', () => {
  it('reads the four numbers out of the raised message', () => {
    expect(parseBudgetError('BUDGET_EXCEEDED|500.00|760.00|0.00|1000.00')).toEqual({
      requested: 500, reserved: 760, actual: 0, budget: 1000,
    })
  })

  it('finds the payload even when Postgres wraps the message in context', () => {
    const raw = 'ERROR:  BUDGET_EXCEEDED|500|760|0|1000\nCONTEXT:  PL/pgSQL function submit_requisition(uuid)'
    expect(parseBudgetError(raw)?.requested).toBe(500)
  })

  it('returns null for any other error, so real failures are not misreported', () => {
    expect(parseBudgetError('requisition has no priced lines')).toBeNull()
    expect(parseBudgetError('')).toBeNull()
    expect(parseBudgetError(null)).toBeNull()
    expect(parseBudgetError(undefined)).toBeNull()
  })

  it('returns null on a truncated or non-numeric payload rather than NaN', () => {
    expect(parseBudgetError('BUDGET_EXCEEDED|500|760')).toBeNull()
    expect(parseBudgetError('BUDGET_EXCEEDED|a|b|c|d')).toBeNull()
  })
})

describe('budgetUsage', () => {
  it('adds reserved and actual, and reports what is left', () => {
    expect(budgetUsage({ reserved: 600, actual: 160, amount: 1000 }))
      .toEqual({ used: 760, remaining: 240, percent: 76, level: 'warn', crossed: 75 })
  })

  it('stays ok below 75%', () => {
    const u = budgetUsage({ reserved: 700, actual: 0, amount: 1000 })
    expect(u.level).toBe('ok')
    expect(u.crossed).toBeNull()
  })

  it('reports the HIGHEST threshold crossed, not the first', () => {
    expect(budgetUsage({ reserved: 950, actual: 0, amount: 1000 }).crossed).toBe(90)
  })

  it('is full at exactly 100% and beyond, with a negative remaining', () => {
    expect(budgetUsage({ reserved: 1000, actual: 0, amount: 1000 }))
      .toMatchObject({ percent: 100, level: 'full', crossed: 100, remaining: 0 })
    expect(budgetUsage({ reserved: 900, actual: 300, amount: 1000 }))
      .toMatchObject({ percent: 120, level: 'full', remaining: -200 })
  })

  it('treats an unbudgeted center as UNMEASURED, not as 0% used', () => {
    // An amount of 0 means "no budget set". Rendering that as 0% used would look
    // like plenty of headroom when there is in fact no budget at all.
    expect(budgetUsage({ reserved: 500, actual: 0, amount: 0 }))
      .toEqual({ used: 500, remaining: -500, percent: null, level: null, crossed: null })
  })

  it('keeps one decimal place instead of rounding a 74.96% up into a warning', () => {
    expect(budgetUsage({ reserved: 749.6, actual: 0, amount: 1000 }))
      .toMatchObject({ percent: 75, level: 'warn' })
    expect(budgetUsage({ reserved: 748, actual: 0, amount: 1000 }))
      .toMatchObject({ percent: 74.8, level: 'ok' })
  })
})
