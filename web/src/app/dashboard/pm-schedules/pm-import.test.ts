import { describe, it, expect } from 'vitest'
import { buildPmScheduleRow, type ImportContext } from './pm-import'

const ctx: ImportContext = {
  organisationId: 'org-1',
  sitesByName: new Map([['main building', 'site-1']]),
  assetsByName: new Map([['carrier ac', 'asset-1']]),
}

function ok(r: ReturnType<typeof buildPmScheduleRow>) {
  if ('error' in r) throw new Error('expected row, got error: ' + r.error)
  return r.row
}

describe('buildPmScheduleRow', () => {
  it('maps a valid row and resolves site/asset by name (case-insensitive)', () => {
    const row = ok(buildPmScheduleRow(
      { title: 'AC Filter', frequency: 'Monthly', next_due_at: '2026-08-01', site_name: 'Main Building', asset_name: 'CARRIER AC' },
      ctx,
    ))
    expect(row.title).toBe('AC Filter')
    expect(row.frequency).toBe('monthly')
    expect(row.site_id).toBe('site-1')
    expect(row.asset_id).toBe('asset-1')
    expect(row.priority).toBe('medium')
    expect(row.organisation_id).toBe('org-1')
    expect(row.is_active).toBe(true)
    expect(row.next_due_at).toMatch(/^2026-08-01T/)
  })

  it('rejects missing title, bad frequency, missing/unparseable date, unknown site/asset, bad interval', () => {
    expect('error' in buildPmScheduleRow({ frequency: 'monthly', next_due_at: '2026-08-01' }, ctx)).toBe(true)
    expect('error' in buildPmScheduleRow({ title: 'x', frequency: 'yearly', next_due_at: '2026-08-01' }, ctx)).toBe(true)
    expect('error' in buildPmScheduleRow({ title: 'x', frequency: 'monthly' }, ctx)).toBe(true)
    expect('error' in buildPmScheduleRow({ title: 'x', frequency: 'monthly', next_due_at: 'notadate' }, ctx)).toBe(true)
    expect('error' in buildPmScheduleRow({ title: 'x', frequency: 'monthly', next_due_at: '2026-08-01', site_name: 'Nope' }, ctx)).toBe(true)
    expect('error' in buildPmScheduleRow({ title: 'x', frequency: 'monthly', next_due_at: '2026-08-01', interval_count: '3', interval_unit: 'decade' }, ctx)).toBe(true)
  })

  it('keeps anchor_day only for month/year custom intervals', () => {
    const monthly = ok(buildPmScheduleRow({ title: 'x', frequency: 'monthly', next_due_at: '2026-08-01', interval_count: '2', interval_unit: 'month', anchor_day: '15' }, ctx))
    expect(monthly.interval_unit).toBe('month')
    expect(monthly.anchor_day).toBe(15)
    const weekly = ok(buildPmScheduleRow({ title: 'x', frequency: 'weekly', next_due_at: '2026-08-01', interval_count: '2', interval_unit: 'week', anchor_day: '15' }, ctx))
    expect(weekly.anchor_day).toBeNull()
  })
})
