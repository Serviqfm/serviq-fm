import { describe, it, expect, vi } from 'vitest'
import { fireErpEvent, resolveAdapter, type ErpAdapter } from './index'
import { UnavailableConnector, buildConnector } from './connectors'
import { validateConfig, missingSecrets } from './fields'
import { PO, deps, fakeFetch } from './testkit'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('fireErpEvent with a live connector — never breaks the triggering flow', () => {
  it('an ERP outage is logged failed and fireErpEvent still resolves', async () => {
    const f = fakeFetch(() => [503, { error: { message: 'down' } }])
    const { deps: d, rows } = deps(f.impl)
    const odoo = buildConnector('odoo', { baseUrl: 'https://a.odoo.com', database: 'a', username: 'u', defaultProductId: '1' }, { apiKey: 'k-123456789' }, d)
    await expect(fireErpEvent('org-1', 'po.sent', PO.id, {}, async () => odoo as ErpAdapter)).resolves.toBeUndefined()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'failed', object_type: 'purchase_order', provider: 'odoo' })
  })

  it('even a network exception inside fetch is contained', async () => {
    const { deps: d, rows } = deps(async () => { throw new TypeError('fetch failed') })
    const bc = buildConnector('dynamics', {
      tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', clientId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      environment: 'production', companyId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', glAccountNumber: '1',
    }, { clientSecret: 's' }, d)
    await fireErpEvent('org-1', 'vendor.created', PO.vendor!.id, {}, async () => bc)
    expect(rows[0]).toMatchObject({ status: 'failed', error: 'Business Central sign-in: could not reach the server' })
  })

  it('UnavailableConnector logs failed with the reason (e.g. no encryption key)', async () => {
    const rows: unknown[] = []
    const c = new UnavailableConnector('oracle', 'org-1', async r => { rows.push(r) }, 'ERP_ENCRYPTION_KEY is not set on the server')
    expect(await c.pushPO('po-1', {})).toMatchObject({ status: 'failed' })
    expect(rows[0]).toMatchObject({ status: 'failed', error: 'Connector not ready: ERP_ENCRYPTION_KEY is not set on the server' })
    expect((await c.testConnection()).ok).toBe(false)
  })
})

/** Minimal Supabase stand-in: erp_connections row + inserts captured, credentials table empty. */
function fakeDb(conn: Record<string, unknown> | null) {
  const inserted: Record<string, unknown>[] = []
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.maybeSingle = async () => ({ data: table === 'erp_connections' ? conn : null, error: null })
    q.insert = async (row: Record<string, unknown>) => { inserted.push(row); return { error: null } }
    return q
  }
  return { db: { from: chain } as unknown as SupabaseClient, inserted }
}

describe('resolveAdapter', () => {
  it("returns the NoopAdapter for 'none'", async () => {
    const { db } = fakeDb({ provider: 'none', is_active: true, config: {} })
    const a = await resolveAdapter('org-1', db)
    expect(await a!.pushPO('po-1', {})).toEqual({ status: 'skipped' })
  })

  it('returns null when the connection is off', async () => {
    const { db } = fakeDb({ provider: 'odoo', is_active: false, config: {} })
    expect(await resolveAdapter('org-1', db)).toBeNull()
  })

  it('a live provider without ERP_ENCRYPTION_KEY logs failed instead of throwing', async () => {
    vi.stubEnv('ERP_ENCRYPTION_KEY', '')
    const { db, inserted } = fakeDb({ provider: 'odoo', is_active: true, config: { baseUrl: 'https://a.odoo.com' } })
    const a = await resolveAdapter('org-1', db)
    expect(a!.provider).toBe('odoo')
    expect(await a!.pushVendor('v-1', {})).toMatchObject({ status: 'failed' })
    expect(inserted[0]).toMatchObject({ status: 'failed', provider: 'odoo' })
    vi.unstubAllEnvs()
  })

  it('a live provider with a key but no saved credentials logs failed', async () => {
    vi.stubEnv('ERP_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'))
    const { db, inserted } = fakeDb({ provider: 'oracle', is_active: true, config: {} })
    const a = await resolveAdapter('org-1', db)
    await a!.syncInvoice('i-1', {})
    expect(inserted[0]).toMatchObject({ status: 'failed', error: 'Connector not ready: credentials have not been saved for this provider' })
    vi.unstubAllEnvs()
  })
})

describe('validateConfig', () => {
  it('drops secrets sent as config and unknown keys', () => {
    const v = validateConfig('odoo', { baseUrl: 'https://a.odoo.com/', database: 'd', username: 'u', apiKey: 'LEAK', evil: 1 })
    expect(v).toEqual({ ok: true, config: { baseUrl: 'https://a.odoo.com', database: 'd', username: 'u' } })
  })

  it('requires https and the provider-specific fields', () => {
    const v = validateConfig('odoo', { baseUrl: 'http://a.odoo.com', database: '', username: 'u' })
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.errors.join(' ')).toMatch(/https.*Database is required|Database is required.*https/)
  })

  it('Oracle fields follow the auth mode', () => {
    const basic = validateConfig('oracle', { baseUrl: 'https://x.oraclecloud.com', username: 'svc', tokenUrl: 'https://ignored.example.com' })
    expect(basic).toEqual({ ok: true, config: { baseUrl: 'https://x.oraclecloud.com', authMode: 'basic', username: 'svc', currencyCode: 'SAR' } })
    expect(missingSecrets('oracle', { authMode: 'basic' }, {})).toEqual(['password'])
    expect(missingSecrets('oracle', { authMode: 'oauth' }, {})).toEqual(['clientSecret'])
  })

  it('Business Central ids must be GUIDs (no path injection)', () => {
    const v = validateConfig('dynamics', { tenantId: 'contoso.onmicrosoft.com', clientId: 'x', companyId: 'y', environment: 'a/b' })
    expect(v.ok).toBe(false)
  })
})
