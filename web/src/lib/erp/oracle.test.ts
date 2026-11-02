import { describe, it, expect } from 'vitest'
import { OracleAdapter, type OracleConfig } from './oracle'
import { INVOICE, PO, VENDOR, deps, fakeFetch, type Call } from './testkit'

const BASIC: OracleConfig = {
  baseUrl: 'https://abcd.fa.ocs.oraclecloud.com', authMode: 'basic', username: 'svc_serviq',
  procurementBU: 'Riyadh BU', supplierSite: 'MAIN', currencyCode: 'SAR', buyerEmail: 'buyer@acme.sa',
}
const PASSWORD = 'oracle-Pa55word-SUPERSECRET'
const API = 'https://abcd.fa.ocs.oraclecloud.com/fscmRestApi/resources/latest'

function oracleServer(over: (c: Call) => [number, unknown] | undefined = () => undefined) {
  return fakeFetch(c => {
    const o = over(c)
    if (o) return o
    if (c.method === 'GET') return [200, { items: [], count: 0, hasMore: false }]
    if (c.url.endsWith('/suppliers')) return [201, { SupplierId: 300000111, Supplier: VENDOR.company_name }]
    if (c.url.endsWith('/draftPurchaseOrders')) return [201, { POHeaderId: 300000222 }]
    if (c.url.endsWith('/invoices')) return [201, { InvoiceId: 300000333 }]
    if (c.url.includes('/token')) return [200, { access_token: 'oracle-bearer-TOKEN', expires_in: 3600 }]
    return [404, {}]
  })
}

describe('OracleAdapter (Fusion Cloud ERP)', () => {
  it('uses basic auth and maps a vendor to /suppliers after a name lookup', async () => {
    const f = oracleServer()
    const { deps: d } = deps(f.impl)
    const r = await new OracleAdapter(BASIC, { password: PASSWORD }, d).pushVendor(VENDOR.id, {})
    expect(r).toEqual({ status: 'success', externalId: '300000111' })
    expect(f.calls[0].headers.Authorization).toBe(`Basic ${Buffer.from(`svc_serviq:${PASSWORD}`).toString('base64')}`)
    expect(decodeURIComponent(f.calls[0].url)).toContain(`/suppliers?onlyData=true&limit=1&fields=SupplierId&q=Supplier='${VENDOR.company_name}'`)
    const create = f.calls[1]
    expect(create.url).toBe(`${API}/suppliers`)
    expect(create.headers['Content-Type']).toBe('application/vnd.oracle.adf.resourceitem+json')
    expect(JSON.parse(create.body)).toEqual({
      Supplier: VENDOR.company_name, TaxOrganizationType: 'CORPORATION', BusinessRelationship: 'SPEND_AUTHORIZED', TaxpayerId: VENDOR.vat_number,
    })
  })

  it('maps a PO to one draftPurchaseOrders POST with lines and schedules', async () => {
    const f = oracleServer()
    const { deps: d } = deps(f.impl)
    const r = await new OracleAdapter(BASIC, { password: PASSWORD }, d).pushPO(PO.id, {})
    expect(r).toEqual({ status: 'success', externalId: '300000222' })
    const po = JSON.parse(f.calls.find(c => c.url.endsWith('/draftPurchaseOrders'))!.body)
    expect(po).toMatchObject({
      ProcurementBU: 'Riyadh BU', RequisitioningBU: 'Riyadh BU', SupplierId: 300000111, SupplierSite: 'MAIN',
      CurrencyCode: 'SAR', Description: 'SERVIQ-PO-42', BuyerEmail: 'buyer@acme.sa',
    })
    expect(po.lines[0]).toEqual({
      LineNumber: 1, LineType: 'Goods', ItemDescription: 'Chiller filter', Quantity: 4, Price: 125.5, UOM: 'Each',
      schedules: [{ ScheduleNumber: 1, Quantity: 4, RequestedDeliveryDate: '2026-11-20' }],
    })
  })

  it('maps an approved invoice to Payables /invoices, reusing an existing one on retry', async () => {
    const f = oracleServer()
    const { deps: d, refs } = deps(f.impl)
    const a = new OracleAdapter(BASIC, { password: PASSWORD }, d)
    await a.syncInvoice(INVOICE.id, {})
    const inv = JSON.parse(f.calls.find(c => c.method === 'POST' && c.url.endsWith('/invoices'))!.body)
    expect(inv).toEqual({
      InvoiceNumber: 'INV-2026-007', InvoiceCurrency: 'SAR', InvoiceAmount: 1402, InvoiceDate: '2026-11-01',
      BusinessUnit: 'Riyadh BU', Supplier: VENDOR.company_name, SupplierSite: 'MAIN', Description: 'Chiller service',
      invoiceLines: [{ LineNumber: 1, LineType: 'Item', LineAmount: 1402, Description: 'Chiller service' }],
    })

    // Our ref was lost but Oracle has it: the lookup must win, no second POST.
    refs.map.delete(`invoice:${INVOICE.id}`)
    const g = oracleServer(c => c.method === 'GET' && c.url.includes('/invoices?') ? [200, { items: [{ InvoiceId: 300000333 }] }] : undefined)
    const { deps: d2 } = deps(g.impl, { refs })
    const r = await new OracleAdapter(BASIC, { password: PASSWORD }, d2).syncInvoice(INVOICE.id, {})
    expect(r.externalId).toBe('300000333')
    expect(g.calls.filter(c => c.method === 'POST' && c.url.endsWith('/invoices'))).toHaveLength(0)
  })

  it('a completed ref short-circuits: no Oracle calls at all', async () => {
    const f = oracleServer()
    const { deps: d, refs } = deps(f.impl)
    await refs.put('purchase_order', PO.id, '300000222', true)
    const r = await new OracleAdapter(BASIC, { password: PASSWORD }, d).pushPO(PO.id, {})
    expect(r).toEqual({ status: 'success', externalId: '300000222' })
    expect(f.calls).toHaveLength(0)
  })

  it('OAuth mode: client-credentials token (guarded) then bearer', async () => {
    const f = oracleServer()
    const guarded: string[] = []
    const { deps: d } = deps(f.impl, { guardUrl: async u => { guarded.push(u) } })
    const cfg: OracleConfig = { ...BASIC, authMode: 'oauth', tokenUrl: 'https://idcs-x.identity.oraclecloud.com/oauth2/v1/token', clientId: 'cid', scope: 'urn:opc:resource:fa' }
    const t = await new OracleAdapter(cfg, { clientSecret: 'oracle-client-SECRET' }, d).testConnection()
    expect(t.ok).toBe(true)
    expect(f.calls[0].url).toBe(cfg.tokenUrl)
    expect(new URLSearchParams(f.calls[0].body).get('grant_type')).toBe('client_credentials')
    expect(f.calls[1].headers.Authorization).toBe('Bearer oracle-bearer-TOKEN')
    expect(guarded).toContain(cfg.tokenUrl)
    expect(guarded.some(u => u.startsWith(API))).toBe(true)
  })

  it('401 → failed with a safe message, password never in the log', async () => {
    const f = oracleServer(() => [401, `<html><body>Unauthorized for svc_serviq:${PASSWORD}</body></html>`])
    const { deps: d, rows } = deps(f.impl)
    const r = await new OracleAdapter(BASIC, { password: PASSWORD }, d).pushVendor(VENDOR.id, {})
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/^Oracle: HTTP 401 — check the credentials/)
    expect(r.error).not.toContain(PASSWORD)
    expect(r.error).not.toContain('<html>')
    expect(JSON.stringify(rows)).not.toContain(PASSWORD)
  })

  it('a redirect is treated as a failure (no following into other hosts)', async () => {
    const f = oracleServer(() => [302, ''])
    const { deps: d } = deps(f.impl)
    const r = await new OracleAdapter(BASIC, { password: PASSWORD }, d).testConnection()
    expect(r).toEqual({ ok: false, message: 'Oracle: unexpected redirect (HTTP 302)' })
  })

  it('missing business unit → clear config error before any PO call', async () => {
    const f = oracleServer()
    const { deps: d } = deps(f.impl)
    const r = await new OracleAdapter({ ...BASIC, procurementBU: '' }, { password: PASSWORD }, d).pushPO(PO.id, {})
    expect(r.error).toBe('Oracle: set the procurement business unit in ERP settings')
    expect(f.calls.some(c => c.url.endsWith('/draftPurchaseOrders'))).toBe(false)
  })
})
