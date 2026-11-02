import { describe, it, expect } from 'vitest'
import { OdooAdapter } from './odoo'
import { INVOICE, PO, VENDOR, deps, fakeFetch, type Call } from './testkit'

const CONFIG = { baseUrl: 'https://acme.odoo.com/', database: 'acme', username: 'api@acme.sa', defaultProductId: '7' }
const SECRET = 'odoo-api-key-SUPERSECRET-123'

function rpcOf(c: Call) {
  const b = JSON.parse(c.body)
  return { service: b.params.service, method: b.params.method, args: b.params.args }
}

/** Odoo fake: authenticate → uid 5; search → [] ; create → 900+n. */
function odooServer(over: (r: ReturnType<typeof rpcOf>) => unknown = () => undefined) {
  let created = 0
  return fakeFetch(c => {
    const r = rpcOf(c)
    const o = over(r)
    if (o !== undefined) return [200, o]
    if (r.method === 'authenticate') return [200, { jsonrpc: '2.0', id: 1, result: 5 }]
    if (r.method === 'version') return [200, { result: { server_version: '17.0' } }]
    const kwMethod = r.args[4]
    if (kwMethod === 'search') return [200, { result: [] }]
    if (kwMethod === 'create') return [200, { result: 900 + ++created }]
    return [200, { result: null }]
  })
}

describe('OdooAdapter', () => {
  it('authenticates via common.authenticate, then execute_kw with the uid', async () => {
    const f = odooServer()
    const { deps: d } = deps(f.impl)
    const r = await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(r.status).toBe('success')
    expect(f.calls[0].url).toBe('https://acme.odoo.com/jsonrpc')
    expect(rpcOf(f.calls[0])).toEqual({ service: 'common', method: 'authenticate', args: ['acme', 'api@acme.sa', SECRET, {}] })
    const kw = rpcOf(f.calls[1])
    expect(kw.service).toBe('object')
    expect(kw.args.slice(0, 5)).toEqual(['acme', 5, SECRET, 'res.partner', 'search'])
  })

  it('maps a vendor to res.partner with supplier_rank and a ServIQ ref', async () => {
    const f = odooServer()
    const { deps: d, rows } = deps(f.impl)
    const r = await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).pushVendor(VENDOR.id, { company_name: 'x' })
    const create = f.calls.map(rpcOf).find(x => x.args[4] === 'create')!
    expect(create.args[3]).toBe('res.partner')
    expect(create.args[5][0]).toMatchObject({
      name: VENDOR.company_name, supplier_rank: 1, is_company: true, ref: `SERVIQ-${VENDOR.id}`,
      vat: VENDOR.vat_number, email: VENDOR.email,
    })
    expect(r).toEqual({ status: 'success', externalId: '901' })
    expect(rows[0]).toMatchObject({ status: 'success', external_id: '901', object_type: 'vendor', provider: 'odoo' })
  })

  it('maps a PO to purchase.order with order_line commands, ensuring the vendor first', async () => {
    const f = odooServer()
    const { deps: d, refs } = deps(f.impl)
    const r = await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).pushPO(PO.id, {})
    expect(r.status).toBe('success')
    const creates = f.calls.map(rpcOf).filter(x => x.args[4] === 'create')
    expect(creates.map(c => c.args[3])).toEqual(['res.partner', 'purchase.order'])
    const vals = creates[1].args[5][0]
    expect(vals).toMatchObject({ partner_id: 901, origin: 'SERVIQ-PO-42', date_planned: '2026-11-20 00:00:00' })
    expect(vals.order_line).toEqual([
      [0, 0, { name: 'Chiller filter', product_id: 7, product_qty: 4, price_unit: 125.5, date_planned: '2026-11-20 00:00:00' }],
      [0, 0, { name: 'Labour', product_id: 7, product_qty: 1, price_unit: 900, date_planned: '2026-11-20 00:00:00' }],
    ])
    expect(refs.map.get(`purchase_order:${PO.id}`)).toEqual({ externalId: '902', complete: true })
  })

  it('maps an approved invoice to account.move in_invoice', async () => {
    const f = odooServer()
    const { deps: d } = deps(f.impl)
    await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).syncInvoice(INVOICE.id, {})
    const create = f.calls.map(rpcOf).filter(x => x.args[4] === 'create').pop()!
    expect(create.args[3]).toBe('account.move')
    expect(create.args[5][0]).toMatchObject({
      move_type: 'in_invoice', partner_id: 901, ref: 'INV-2026-007', invoice_date: '2026-11-01',
      invoice_origin: 'SERVIQ-PO-42',
      invoice_line_ids: [[0, 0, { name: 'Chiller service', quantity: 1, price_unit: 1402, product_id: 7 }]],
    })
  })

  it('is idempotent: a second push of the same PO makes no ERP calls', async () => {
    const f = odooServer()
    const { deps: d, rows } = deps(f.impl)
    const a = new OdooAdapter(CONFIG, { apiKey: SECRET }, d)
    await a.pushPO(PO.id, {})
    const n = f.calls.length
    const again = await a.pushPO(PO.id, {})
    expect(again).toEqual({ status: 'success', externalId: '902' })
    expect(f.calls.length).toBe(n)
    expect(rows).toHaveLength(2)
  })

  it('finds an existing remote record instead of duplicating it (our ref was lost)', async () => {
    const f = odooServer(r => (r.args[4] === 'search' && r.args[3] === 'res.partner' ? { result: [77] } : undefined))
    const { deps: d } = deps(f.impl)
    const r = await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(r.externalId).toBe('77')
    expect(f.calls.map(rpcOf).some(x => x.args[4] === 'create')).toBe(false)
  })

  it('bad credentials → failed with a safe message', async () => {
    const f = odooServer(r => (r.method === 'authenticate' ? { result: false } : undefined))
    const { deps: d, rows } = deps(f.impl)
    const r = await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/authentication failed/)
    expect(rows[0].status).toBe('failed')
  })

  it('an RPC error never leaks the API key or the server traceback', async () => {
    const f = odooServer(r => (r.args[4] === 'create' ? {
      error: { code: 200, message: 'Odoo Server Error', data: { name: 'odoo.exceptions.ValidationError', message: `bad value for key ${SECRET}`, debug: 'Traceback SECRET-DEBUG' } },
    } : undefined))
    const { deps: d, rows } = deps(f.impl)
    const r = await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(r.status).toBe('failed')
    expect(r.error).not.toContain(SECRET)
    expect(r.error).not.toContain('Traceback')
    expect(JSON.stringify(rows)).not.toContain(SECRET)
  })

  it('HTTP 500 → failed; PO without a default product → clear config error', async () => {
    const f = fakeFetch(() => [500, 'Internal Server Error'])
    const { deps: d } = deps(f.impl)
    const r = await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(r).toMatchObject({ status: 'failed' })
    expect(r.error).toMatch(/Odoo: HTTP 500/)

    const ok = odooServer()
    const { deps: d2 } = deps(ok.impl)
    const r2 = await new OdooAdapter({ ...CONFIG, defaultProductId: '' }, { apiKey: SECRET }, d2).pushPO(PO.id, {})
    expect(r2.error).toMatch(/default product ID/)
  })

  it('times out a hanging server', async () => {
    const hang = async (_u: string, init?: RequestInit) => new Promise<Response>((_, rej) => {
      init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
    const { deps: d } = deps(hang, { timeoutMs: 20 })
    const r = await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(r.error).toMatch(/timed out/)
  })

  it('runs the SSRF guard before each request and fails cleanly when it blocks', async () => {
    const f = odooServer()
    const { deps: d } = deps(f.impl, { guardUrl: async () => { throw new Error('URL points at a private or reserved address') } })
    const r = await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(r.error).toMatch(/blocked URL/)
    expect(f.calls).toHaveLength(0)
  })

  it('testConnection reports version + uid, or the auth failure', async () => {
    const f = odooServer()
    const { deps: d } = deps(f.impl)
    expect(await new OdooAdapter(CONFIG, { apiKey: SECRET }, d).testConnection()).toEqual({ ok: true, message: 'Connected to Odoo 17.0 as user #5' })
    const bad = odooServer(r => (r.method === 'authenticate' ? { result: false } : undefined))
    const { deps: d2 } = deps(bad.impl)
    const t = await new OdooAdapter(CONFIG, { apiKey: SECRET }, d2).testConnection()
    expect(t.ok).toBe(false)
  })
})
