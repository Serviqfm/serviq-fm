import { describe, expect, it } from 'vitest'
import en from '../content/help/en.json'
import ar from '../content/help/ar.json'
import { HELP_PATHS, moduleForPath } from './help-paths'

describe('help paths', () => {
  it('matches en.json', () => {
    expect(HELP_PATHS).toEqual(en.modules.map(m => [m.key, m.path]))
  })

  it('picks the longest matching route', () => {
    expect(moduleForPath('/dashboard')).toBe('dashboard')
    expect(moduleForPath('/dashboard/work-orders/123')).toBe('work_orders')
    expect(moduleForPath('/dashboard/asset-log/reports')).toBe('asset_log_reports')
    expect(moduleForPath('/dashboard/reports/builder/x')).toBe('reports_builder')
    expect(moduleForPath('/dashboard/work-orders-x')).toBeNull()
    expect(moduleForPath('/dashboard/help')).toBeNull()
  })

  it('Arabic arrays line up with English by index', () => {
    const tr = ar.modules as Record<string, Record<string, unknown[] | string>>
    for (const m of en.modules) {
      const a = tr[m.key]
      for (const k of ['steps', 'fields', 'perms', 'faq'] as const) {
        if (a?.[k]) expect((a[k] as unknown[]).length, `${m.key}.${k}`).toBe(m[k].length)
      }
    }
  })
})
