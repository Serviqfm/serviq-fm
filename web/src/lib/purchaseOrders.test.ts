import { describe, it, expect } from 'vitest'
import { canAdvance, onTimeDelivery } from './purchaseOrders'

describe('canAdvance — forward-only PO lifecycle', () => {
  it('allows sent → acknowledged → in_transit', () => {
    expect(canAdvance('sent', 'acknowledged')).toEqual({ ok: true })
    expect(canAdvance('sent', 'in_transit')).toEqual({ ok: true })
    expect(canAdvance('acknowledged', 'in_transit')).toEqual({ ok: true })
    expect(canAdvance('draft', 'acknowledged')).toEqual({ ok: true })
  })

  it('refuses to move backwards', () => {
    expect(canAdvance('in_transit', 'acknowledged')).toEqual({ ok: false, reason: 'backwards' })
    expect(canAdvance('received', 'in_transit')).toEqual({ ok: false, reason: 'backwards' })
  })

  it('refuses to re-set the status it is already on', () => {
    expect(canAdvance('acknowledged', 'acknowledged')).toEqual({ ok: false, reason: 'backwards' })
  })

  it('refuses to advance out of cancelled', () => {
    expect(canAdvance('cancelled', 'in_transit')).toEqual({ ok: false, reason: 'terminal' })
  })

  it('refuses statuses this route does not own', () => {
    // 'sent' is the send route's (it means the vendor was emailed) and
    // 'received' is the RPC's (it moves stock).
    expect(canAdvance('draft', 'sent')).toEqual({ ok: false, reason: 'not_advanceable' })
    expect(canAdvance('in_transit', 'received')).toEqual({ ok: false, reason: 'not_advanceable' })
    expect(canAdvance('draft', 'teleported')).toEqual({ ok: false, reason: 'not_advanceable' })
  })
})

describe('onTimeDelivery', () => {
  it('counts arrival on the promised day as on time', () => {
    expect(onTimeDelivery([
      { expected_at: '2026-03-10', received_at: '2026-03-10T18:30:00Z' },
    ])).toEqual({ onTime: 1, total: 1, percent: 100 })
  })

  it('counts the day after as late', () => {
    expect(onTimeDelivery([
      { expected_at: '2026-03-10', received_at: '2026-03-11T00:05:00Z' },
    ])).toEqual({ onTime: 0, total: 1, percent: 0 })
  })

  it('excludes unjudgeable orders from BOTH halves of the fraction', () => {
    // 2 on time, 1 late, plus two that cannot be judged => 67%, not 40%.
    expect(onTimeDelivery([
      { expected_at: '2026-03-10', received_at: '2026-03-09T10:00:00Z' },
      { expected_at: '2026-03-10', received_at: '2026-03-10T23:00:00Z' },
      { expected_at: '2026-03-10', received_at: '2026-03-15T10:00:00Z' },
      { expected_at: null, received_at: '2026-03-10T10:00:00Z' },
      { expected_at: '2026-03-10', received_at: null },
    ])).toEqual({ onTime: 2, total: 3, percent: 67 })
  })

  it('reports null rather than 0% when there is nothing to judge', () => {
    expect(onTimeDelivery([])).toEqual({ onTime: 0, total: 0, percent: null })
    expect(onTimeDelivery([{ expected_at: null, received_at: null }]))
      .toEqual({ onTime: 0, total: 0, percent: null })
  })
})
