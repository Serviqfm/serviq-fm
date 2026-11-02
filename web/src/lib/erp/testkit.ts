// Test-only fakes for the connector tests (not imported by app code).
import type { LogRow } from './index'
import type { ConnectorDeps, ErpDataSource, ExternalRef, InvoiceData, PoData, RefStore, VendorData } from './remote'

export const VENDOR: VendorData = {
  id: '11111111-1111-1111-1111-111111111111',
  company_name: "Al Faris Technical Services",
  vat_number: '300000000000003',
  cr_number: '1010101010',
  email: 'ap@alfaris.example',
  phone: '+966500000000',
  contact_name: 'Faris',
}

export const PO: PoData = {
  id: '22222222-2222-2222-2222-222222222222',
  poNumber: '42',
  notes: 'Deliver to gate 3',
  expectedAt: '2026-11-20',
  sentAt: '2026-11-02T09:00:00.000Z',
  vendor: VENDOR,
  lines: [
    { description: 'Chiller filter', quantity: 4, unitPrice: 125.5 },
    { description: 'Labour', quantity: 1, unitPrice: 900 },
  ],
}

export const INVOICE: InvoiceData = {
  id: '33333333-3333-3333-3333-333333333333',
  invoiceNumber: 'INV-2026-007',
  amount: 1402,
  invoiceDate: '2026-11-01',
  description: 'Chiller service',
  poNumber: '42',
  vendor: VENDOR,
  lines: [],
}

export function memoryRefs(): RefStore & { map: Map<string, ExternalRef> } {
  const map = new Map<string, ExternalRef>()
  return {
    map,
    async get(t, id) { return map.get(`${t}:${id}`) ?? null },
    async put(t, id, externalId, complete) { map.set(`${t}:${id}`, { externalId, complete }) },
  }
}

export function staticData(): ErpDataSource {
  return {
    async vendor(id) { return id === VENDOR.id ? VENDOR : null },
    async purchaseOrder(id) { return id === PO.id ? PO : null },
    async invoice(id) { return id === INVOICE.id ? INVOICE : null },
  }
}

export type Call = { url: string; method: string; headers: Record<string, string>; body: string }

/** A fetch fake: `handler` returns [status, jsonBody] per call; every call is recorded. */
export function fakeFetch(handler: (c: Call, n: number) => [number, unknown] | Promise<[number, unknown]>) {
  const calls: Call[] = []
  const impl = async (url: string, init?: RequestInit) => {
    const c: Call = {
      url,
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: typeof init?.body === 'string' ? init.body : '',
    }
    calls.push(c)
    const [status, body] = await handler(c, calls.length - 1)
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }
  return { impl, calls }
}

export function deps(fetchImpl: ConnectorDeps['fetchImpl'], over: Partial<ConnectorDeps> = {}) {
  const rows: LogRow[] = []
  const refs = memoryRefs()
  const d: ConnectorDeps = {
    orgId: 'org-1',
    writeLog: async r => { rows.push(r) },
    data: staticData(),
    refs,
    fetchImpl,
    guardUrl: async () => {},
    ...over,
  }
  return { deps: d, rows, refs }
}
