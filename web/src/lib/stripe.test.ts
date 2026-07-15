import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('planForPriceId', () => {
  const OLD = process.env
  beforeEach(() => { vi.resetModules(); process.env = { ...OLD } })
  afterEach(() => { process.env = OLD })

  it('maps a configured price id back to its plan', async () => {
    process.env.STRIPE_PRICE_STARTER = 'price_starter'
    process.env.STRIPE_PRICE_PRO = 'price_pro'
    const { planForPriceId } = await import('./stripe')
    expect(planForPriceId('price_starter')).toBe('starter')
    expect(planForPriceId('price_pro')).toBe('pro')
  })

  it('returns null for unknown or empty price ids', async () => {
    process.env.STRIPE_PRICE_STARTER = 'price_starter'
    const { planForPriceId } = await import('./stripe')
    expect(planForPriceId('price_unknown')).toBeNull()
    expect(planForPriceId(null)).toBeNull()
    expect(planForPriceId(undefined)).toBeNull()
  })

  it('getStripe returns null when STRIPE_SECRET_KEY is unset', async () => {
    delete process.env.STRIPE_SECRET_KEY
    const { getStripe } = await import('./stripe')
    expect(getStripe()).toBeNull()
  })
})
