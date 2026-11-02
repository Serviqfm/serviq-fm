import { describe, it, expect } from 'vitest'
import { DynamicsAdapter } from './dynamics'
import { INVOICE, PO, VENDOR, deps, fakeFetch, type Call } from './testkit'

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const COMPANY = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const CONFIG = {
  tenantId: TENANT, clientId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  environment: 'production', companyId: COMPANY, glAccountNumber: '6110',
}
const SECRET = 'bc-client-secret~SUPERSECRET'
const TOKEN = 'eyJ0eXAiOiJKV1Q.access-token-value'
const BASE = `https://api.businesscentral.dynamics.com/v2.0/${TENANT}/production/api/v2.0/companies(${COMPANY})`
const V_ID = 'dddddddd-0000-0000-0000-000000000001'

function bcServer(over: (c: Call) => [number, unknown] | undefined = () => undefined) {
  let n = 0
  return fakeFetch(c => {
    const o = over(c)
    if (o) return o
    if (c.url.includes('login.microsoftonline.com')) return [200, { access_token: TOKEN, expires_in: 3599, token_type: 'Bearer' }]
    if (c.method === 'GET') return [200, { value: [] }]
    if (c.url.endsWith('/vendors')) return [201, { id: V_ID }]
    return [201, { id: `eeeeeeee-0000-0000-0000-00000000000${++n}` }]
  })
}

describe('DynamicsAdapter (Business Central)', () => {
  it('gets a client-credentials token from Entra ID and sends it as a bearer', async () => {
    const f = bcServer()
    const { deps: d } = deps(f.impl)
    const r = await new DynamicsAdapter(CONFIG, { clientSecret: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(r).toEqual({ status: 'success', externalId: V_ID })
    const tok = f.calls[0]
    expect(tok.url).toBe(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`)
    const form = new URLSearchParams(tok.body)
    expect(form.get('grant_type')).toBe('client_credentials')
    expect(form.get('scope')).toBe('https://api.businesscentral.dynamics.com/.default')
    expect(form.get('client_secret')).toBe(SECRET)
    expect(f.calls[1].headers.Authorization).toBe(`Bearer ${TOKEN}`)
    // Token is cached across calls.
    expect(f.calls.filter(c => c.url.includes('login.microsoftonline')).length).toBe(1)
  })

  it('looks a vendor up by VAT, then creates it with the mapped shape', async () => {
    const f = bcServer()
    const { deps: d } = deps(f.impl)
    await new DynamicsAdapter(CONFIG, { clientSecret: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(decodeURIComponent(f.calls[1].url)).toBe(`${BASE}/vendors?$filter=taxRegistrationNumber eq '${VENDOR.vat_number}'&$top=1`)
    const create = f.calls[2]
    expect(create.url).toBe(`${BASE}/vendors`)
    expect(JSON.parse(create.body)).toEqual({
      displayName: VENDOR.company_name, email: VENDOR.email, phoneNumber: VENDOR.phone, taxRegistrationNumber: VENDOR.vat_number,
    })
  })

  it('maps a PO to purchaseOrders + G/L account purchaseOrderLines', async () => {
    const f = bcServer()
    const { deps: d, refs } = deps(f.impl)
    const r = await new DynamicsAdapter(CONFIG, { clientSecret: SECRET }, d).pushPO(PO.id, {})
    expect(r.status).toBe('success')
    const header = f.calls.find(c => c.method === 'POST' && c.url.endsWith('/purchaseOrders'))!
    expect(JSON.parse(header.body)).toEqual({ vendorId: V_ID, orderDate: '2026-11-02', requestedReceiptDate: '2026-11-20' })
    const lines = f.calls.filter(c => c.method === 'POST' && c.url.endsWith('/purchaseOrderLines')).map(c => JSON.parse(c.body))
    expect(lines).toEqual([
      { lineType: 'Account', lineObjectNumber: '6110', description: 'Chiller filter', quantity: 4, directUnitCost: 125.5 },
      { lineType: 'Account', lineObjectNumber: '6110', description: 'Labour', quantity: 1, directUnitCost: 900 },
    ])
    expect(refs.map.get(`purchase_order:${PO.id}`)?.complete).toBe(true)
  })

  it('resumes a half-done PO on retry: no second header, only the missing line', async () => {
    let failSecondLine = true
    const f = bcServer(c => {
      if (c.method === 'POST' && c.url.endsWith('/purchaseOrderLines') && JSON.parse(c.body).description === 'Labour' && failSecondLine) {
        return [503, { error: { code: 'ServiceUnavailable', message: 'Try again later' } }]
      }
      if (c.method === 'GET' && c.url.includes('/purchaseOrderLines')) {
        return [200, { value: failSecondLine ? [] : [{ id: 'line-1' }] }]
      }
      return undefined
    })
    const { deps: d, refs } = deps(f.impl)
    const a = new DynamicsAdapter(CONFIG, { clientSecret: SECRET }, d)
    const first = await a.pushPO(PO.id, {})
    expect(first.status).toBe('failed')
    expect(first.error).toMatch(/HTTP 503 — Try again later/)
    const ref = refs.map.get(`purchase_order:${PO.id}`)!
    expect(ref.complete).toBe(false)

    failSecondLine = false
    const before = f.calls.length
    const second = await a.pushPO(PO.id, {})
    expect(second).toEqual({ status: 'success', externalId: ref.externalId })
    const retryCalls = f.calls.slice(before)
    expect(retryCalls.some(c => c.method === 'POST' && c.url.endsWith('/purchaseOrders'))).toBe(false)
    const lineBodies = retryCalls.filter(c => c.method === 'POST').map(c => JSON.parse(c.body).description)
    expect(lineBodies).toEqual(['Labour'])
  })

  it('maps an approved invoice to purchaseInvoices (+ lines with unitCost), finding duplicates first', async () => {
    const f = bcServer()
    const { deps: d } = deps(f.impl)
    await new DynamicsAdapter(CONFIG, { clientSecret: SECRET }, d).syncInvoice(INVOICE.id, {})
    const lookup = f.calls.find(c => c.method === 'GET' && c.url.includes('/purchaseInvoices?'))!
    expect(decodeURIComponent(lookup.url)).toContain(`vendorInvoiceNumber eq 'INV-2026-007' and vendorId eq ${V_ID}`)
    const header = f.calls.find(c => c.method === 'POST' && c.url.endsWith('/purchaseInvoices'))!
    expect(JSON.parse(header.body)).toEqual({ vendorId: V_ID, vendorInvoiceNumber: 'INV-2026-007', invoiceDate: '2026-11-01' })
    const line = f.calls.find(c => c.url.endsWith('/purchaseInvoiceLines') && c.method === 'POST')!
    expect(JSON.parse(line.body)).toEqual({ lineType: 'Account', lineObjectNumber: '6110', description: 'Chiller service', quantity: 1, unitCost: 1402 })
  })

  it('a rejected token request → failed, and neither the secret nor the token leaks', async () => {
    const f = bcServer(c => c.url.includes('login.microsoftonline')
      ? [401, { error: 'invalid_client', error_description: `AADSTS7000215: Invalid client secret provided. ${SECRET}\r\nTrace ID: x` }]
      : undefined)
    const { deps: d, rows } = deps(f.impl)
    const r = await new DynamicsAdapter(CONFIG, { clientSecret: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/sign-in: HTTP 401 — check the credentials — invalid_client: AADSTS7000215/)
    expect(r.error).not.toContain(SECRET)
    expect(r.error).not.toContain('Trace ID')
    expect(JSON.stringify(rows)).not.toContain(SECRET)
  })

  it('an API error echoing the bearer token is redacted', async () => {
    const f = bcServer(c => c.method === 'POST' && c.url.endsWith('/vendors')
      ? [400, { error: { code: 'BadRequest', message: `bad header Bearer ${TOKEN}` } }] : undefined)
    const { deps: d } = deps(f.impl)
    const r = await new DynamicsAdapter(CONFIG, { clientSecret: SECRET }, d).pushVendor(VENDOR.id, {})
    expect(r.error).not.toContain(TOKEN)
    expect(r.error).toContain('***')
  })

  it('rejects path-injecting config before any request', async () => {
    const f = bcServer()
    const { deps: d } = deps(f.impl)
    const r = await new DynamicsAdapter({ ...CONFIG, environment: 'prod/../../x?' }, { clientSecret: SECRET }, d).testConnection()
    expect(r).toEqual({ ok: false, message: 'Business Central: environment is invalid' })
    expect(f.calls).toHaveLength(0)
  })

  it('testConnection reads the company', async () => {
    const f = bcServer(c => c.method === 'GET' && c.url === BASE ? [200, { id: COMPANY, displayName: 'Serviq Demo' }] : undefined)
    const { deps: d } = deps(f.impl)
    expect(await new DynamicsAdapter(CONFIG, { clientSecret: SECRET }, d).testConnection())
      .toEqual({ ok: true, message: 'Connected to Business Central company "Serviq Demo"' })
  })
})
