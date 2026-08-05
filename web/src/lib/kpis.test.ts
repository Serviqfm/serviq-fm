import { describe, it, expect } from 'vitest'
import {
  mttrHours, mtbfDays, totalMaintenanceCost, activeTechnicians,
  slaBreaches, slaCompliancePercent, downtimeStats, scheduledAvailabilityPct,
  type WoKpiRow, type TechRow,
} from './kpis'

const H = 3_600_000
const D = 86_400_000
const NOW = Date.parse('2026-07-14T00:00:00Z')
const iso = (msFromNow: number) => new Date(NOW + msFromNow).toISOString()

describe('mttrHours', () => {
  it('averages completed_at − created_at over completed WOs', () => {
    const rows: WoKpiRow[] = [
      { created_at: iso(-10 * H), completed_at: iso(-8 * H) }, // 2h
      { created_at: iso(-10 * H), completed_at: iso(-6 * H) }, // 4h
      { created_at: iso(-10 * H), completed_at: null },        // ignored (open)
    ]
    expect(mttrHours(rows)).toBe(3)
  })
  it('returns null with no completions', () => {
    expect(mttrHours([{ created_at: iso(0), completed_at: null }])).toBeNull()
  })
  it('drops bad spans (completed before created)', () => {
    expect(mttrHours([{ created_at: iso(0), completed_at: iso(-H) }])).toBeNull()
  })
})

describe('mtbfDays', () => {
  it('avg gap between consecutive completions per asset, then across assets', () => {
    const rows: WoKpiRow[] = [
      { asset_id: 'a', completed_at: iso(0) },
      { asset_id: 'a', completed_at: iso(2 * D) },  // gap 2d
      { asset_id: 'a', completed_at: iso(6 * D) },  // gap 4d -> asset a avg 3d
      { asset_id: 'b', completed_at: iso(0) },
      { asset_id: 'b', completed_at: iso(1 * D) },  // asset b avg 1d
    ]
    expect(mtbfDays(rows)).toBe(2) // (3 + 1) / 2
  })
  it('ignores assets with a single completion and WOs without asset', () => {
    expect(mtbfDays([{ asset_id: 'a', completed_at: iso(0) }, { completed_at: iso(D) }])).toBeNull()
  })
})

describe('downtimeStats', () => {
  it('sums closed periods inside the window', () => {
    const { downtimeMs, availabilityPct } = downtimeStats(
      [{ started_at: iso(-3 * D), ended_at: iso(-2 * D) }], 10, NOW) // 1d down of 10d
    expect(downtimeMs).toBe(D)
    expect(availabilityPct).toBe(90)
  })
  it('counts open periods up to now and clamps to window start', () => {
    const { downtimeMs } = downtimeStats(
      [{ started_at: iso(-20 * D), ended_at: null }], 10, NOW) // down the whole window
    expect(downtimeMs).toBe(10 * D)
  })
  it('ignores periods entirely before the window', () => {
    const { downtimeMs, availabilityPct } = downtimeStats(
      [{ started_at: iso(-40 * D), ended_at: iso(-35 * D) }], 30, NOW)
    expect(downtimeMs).toBe(0)
    expect(availabilityPct).toBe(100)
  })
})

describe('scheduledAvailabilityPct (AL-07)', () => {
  it('null/0/full hours falls back to calendar availability', () => {
    // 1d down of 10d calendar = 90%
    expect(scheduledAvailabilityPct(D, 10, null)).toBe(90)
    expect(scheduledAvailabilityPct(D, 10, 0)).toBe(90)
    expect(scheduledAvailabilityPct(D, 10, 168)).toBe(90)
  })
  it('scores against scheduled hours, not the calendar', () => {
    // 84h/week = half the calendar → operating window is 5d; 1d down of 5d = 80%
    expect(scheduledAvailabilityPct(D, 10, 84)).toBe(80)
  })
  it('clamps downtime to the operating window and never goes negative', () => {
    expect(scheduledAvailabilityPct(100 * D, 10, 84)).toBe(0)
  })
})

describe('totalMaintenanceCost', () => {
  it('sums actual_cost, treating null/undefined as 0', () => {
    expect(totalMaintenanceCost([{ actual_cost: 100 }, { actual_cost: null }, { actual_cost: 50.5 }])).toBe(150.5)
  })
})

describe('activeTechnicians', () => {
  const users: TechRow[] = [
    { role: 'technician', is_active: true, last_sign_in_at: iso(-5 * D) },   // active
    { role: 'technician', is_active: true, last_sign_in_at: iso(-40 * D) },  // stale
    { role: 'technician', is_active: false, last_sign_in_at: iso(-1 * D) },  // deactivated
    { role: 'technician', is_active: true, last_sign_in_at: null },          // never signed in
    { role: 'manager', is_active: true, last_sign_in_at: iso(-1 * D) },      // not a tech
  ]
  it('counts active techs who signed in within the window', () => {
    expect(activeTechnicians(users, 30, NOW)).toBe(1)
  })
})

describe('slaBreaches / slaCompliancePercent', () => {
  const rows: WoKpiRow[] = [
    // explicit due_at, completed late -> breach 2h
    { wo_number: 'WO-1', due_at: iso(-4 * H), completed_at: iso(-2 * H) },
    // sla_hours deadline (created -10h + 4h = -6h), still open now -> breach 6h
    { wo_number: 'WO-2', created_at: iso(-10 * H), sla_hours: 4, completed_at: null },
    // completed before due -> met
    { wo_number: 'WO-3', due_at: iso(2 * H), completed_at: iso(1 * H) },
    // no deadline signal -> skipped from both counts
    { wo_number: 'WO-4', completed_at: iso(0) },
  ]
  it('flags only breached WOs, sorted worst-first', () => {
    const b = slaBreaches(rows, NOW)
    expect(b.map(x => x.wo_number)).toEqual(['WO-2', 'WO-1'])
    expect(b[0].overdueHours).toBeCloseTo(6)
    expect(b[1].overdueHours).toBeCloseTo(2)
  })
  it('compliance = met / with-deadline, ignoring no-deadline WOs', () => {
    // 3 have a deadline (WO-1,2,3); 1 met -> 33%
    expect(slaCompliancePercent(rows, NOW)).toBe(33)
  })
  it('returns null compliance when nothing has a deadline', () => {
    expect(slaCompliancePercent([{ wo_number: 'x', completed_at: iso(0) }], NOW)).toBeNull()
  })
})
