// W7-02 — Oracle Fusion Cloud ERP connector (REST, /fscmRestApi/resources/latest).
//
//   auth:    basic (username + password) or OAuth2 client credentials against the
//            configured token URL (IDCS / OCI IAM) → bearer token
//   vendor   → /suppliers            (looked up first by Supplier name)
//   PO       → /draftPurchaseOrders  (header + lines in ONE POST — atomic)
//   invoice  → /invoices (Payables)  (looked up first by InvoiceNumber + BU;
//                                     header + invoiceLines in one POST)
//
// Both the base URL and the token URL are user-supplied, so every request goes
// through the SSRF guard first. Business-unit / site / currency come from the
// non-secret config; Oracle rejects a PO or invoice without them, so we fail
// early with a message that says which setting to fill.

import { ErpRequestError, requestJson } from './http'
import {
  RemoteAdapter, invoiceLines, today,
  type ConnectorDeps, type InvoiceData, type MarkCreated, type PoData, type TestResult, type VendorData,
} from './remote'

export type OracleConfig = {
  baseUrl: string
  authMode: 'basic' | 'oauth'
  username?: string
  tokenUrl?: string
  clientId?: string
  scope?: string
  procurementBU?: string
  supplierSite?: string
  buyerEmail?: string
  categoryName?: string
  currencyCode?: string
}
export type OracleSecrets = { password?: string; clientSecret?: string }

const API = '/fscmRestApi/resources/latest'
const ITEM_JSON = 'application/vnd.oracle.adf.resourceitem+json'

/** Oracle `q=` finder values are single-quoted; escape embedded quotes. */
function qValue(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

export class OracleAdapter extends RemoteAdapter {
  readonly provider = 'oracle' as const
  private bearer: { value: string; expiresAt: number } | null = null

  constructor(private readonly config: OracleConfig, private readonly secrets: OracleSecrets, deps: ConnectorDeps) {
    super(deps)
  }

  protected secretValues() {
    return [this.secrets.password ?? '', this.secrets.clientSecret ?? '', this.bearer?.value ?? '']
  }

  private async authHeader(): Promise<string> {
    if (this.config.authMode === 'oauth') {
      if (this.bearer && this.bearer.expiresAt > Date.now()) return `Bearer ${this.bearer.value}`
      const { tokenUrl, clientId, scope } = this.config
      if (!tokenUrl || !clientId || !this.secrets.clientSecret) throw new ErpRequestError('Oracle: OAuth settings are incomplete')
      await this.guard(tokenUrl)
      const basic = Buffer.from(`${clientId}:${this.secrets.clientSecret}`, 'utf8').toString('base64')
      const { body } = await requestJson(this.fetchImpl, tokenUrl, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'client_credentials', ...(scope ? { scope } : {}) }).toString(),
      }, { label: 'Oracle sign-in', timeoutMs: this.deps.timeoutMs })
      const b = body as { access_token?: unknown; expires_in?: unknown }
      if (typeof b?.access_token !== 'string') throw new ErpRequestError('Oracle sign-in: no access token returned')
      const ttl = Number(b.expires_in) || 3600
      this.bearer = { value: b.access_token, expiresAt: Date.now() + Math.max(60, ttl - 60) * 1000 }
      return `Bearer ${b.access_token}`
    }
    if (!this.config.username || !this.secrets.password) throw new ErpRequestError('Oracle: username and password are required')
    return `Basic ${Buffer.from(`${this.config.username}:${this.secrets.password}`, 'utf8').toString('base64')}`
  }

  private async api(path: string, init: { method?: string; body?: unknown } = {}): Promise<Record<string, unknown>> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}${API}${path}`
    await this.guard(url)
    const auth = await this.authHeader()
    const { body } = await requestJson(this.fetchImpl, url, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': ITEM_JSON } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }, { label: 'Oracle', timeoutMs: this.deps.timeoutMs })
    return (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  }

  private static firstItem(b: Record<string, unknown>): Record<string, unknown> | null {
    const items = Array.isArray(b.items) ? b.items : []
    return (items[0] as Record<string, unknown>) ?? null
  }

  private static idOf(b: Record<string, unknown> | null, field: string, what: string): string {
    const v = b?.[field]
    if (typeof v === 'number' || (typeof v === 'string' && v)) return String(v)
    throw new ErpRequestError(`Oracle: ${what} returned no ${field}`)
  }

  private need(key: 'procurementBU' | 'supplierSite', label: string): string {
    const v = this.config[key]
    if (!v) throw new ErpRequestError(`Oracle: set the ${label} in ERP settings`)
    return v
  }

  async testConnection(): Promise<TestResult> {
    try {
      await this.api('/suppliers?limit=1&onlyData=true&fields=SupplierId')
      return { ok: true, message: 'Connected to Oracle Fusion (suppliers API reachable)' }
    } catch (e) {
      return { ok: false, message: this.safeError(e) }
    }
  }

  static supplierBody(v: VendorData): Record<string, unknown> {
    return {
      Supplier: v.company_name.slice(0, 360),
      TaxOrganizationType: 'CORPORATION',
      BusinessRelationship: 'SPEND_AUTHORIZED',
      ...(v.vat_number ? { TaxpayerId: v.vat_number.slice(0, 30) } : {}),
    }
  }

  protected async createVendor(v: VendorData): Promise<string> {
    const name = v.company_name.slice(0, 360)
    const hit = OracleAdapter.firstItem(await this.api(
      `/suppliers?onlyData=true&limit=1&fields=SupplierId&q=${encodeURIComponent(`Supplier=${qValue(name)}`)}`))
    if (hit) return OracleAdapter.idOf(hit, 'SupplierId', 'supplier lookup')
    return OracleAdapter.idOf(await this.api('/suppliers', { method: 'POST', body: OracleAdapter.supplierBody(v) }), 'SupplierId', 'supplier create')
  }

  static draftPoBody(po: PoData, supplierId: string, c: OracleConfig): Record<string, unknown> {
    return {
      ProcurementBU: c.procurementBU,
      RequisitioningBU: c.procurementBU,
      SupplierId: Number(supplierId),
      SupplierSite: c.supplierSite,
      CurrencyCode: c.currencyCode || 'SAR',
      Description: `SERVIQ-PO-${po.poNumber}`,
      ...(c.buyerEmail ? { BuyerEmail: c.buyerEmail } : {}),
      lines: po.lines.map((l, i) => ({
        LineNumber: i + 1,
        LineType: 'Goods',
        ItemDescription: l.description.slice(0, 240),
        Quantity: l.quantity,
        Price: l.unitPrice,
        UOM: 'Each',
        ...(c.categoryName ? { CategoryName: c.categoryName } : {}),
        schedules: [{
          ScheduleNumber: 1,
          Quantity: l.quantity,
          ...(po.expectedAt ? { RequestedDeliveryDate: po.expectedAt } : {}),
        }],
      })),
    }
  }

  protected async createPO(po: PoData, vendorExtId: string, existing: string | null, _mark: MarkCreated): Promise<string> {
    if (existing) return existing // single atomic POST — nothing partial to resume
    this.need('procurementBU', 'procurement business unit')
    this.need('supplierSite', 'default supplier site')
    const res = await this.api('/draftPurchaseOrders', { method: 'POST', body: OracleAdapter.draftPoBody(po, vendorExtId, this.config) })
    return OracleAdapter.idOf(res, 'POHeaderId', 'draft purchase order create')
  }

  static invoiceBody(inv: InvoiceData, supplierName: string, c: OracleConfig): Record<string, unknown> {
    const lines = invoiceLines(inv)
    return {
      InvoiceNumber: inv.invoiceNumber.slice(0, 50),
      InvoiceCurrency: c.currencyCode || 'SAR',
      InvoiceAmount: inv.amount,
      InvoiceDate: inv.invoiceDate ?? today(),
      BusinessUnit: c.procurementBU,
      Supplier: supplierName,
      SupplierSite: c.supplierSite,
      Description: (inv.description ?? `ServIQ invoice ${inv.invoiceNumber}`).slice(0, 240),
      invoiceLines: lines.map((l, i) => ({
        LineNumber: i + 1,
        LineType: 'Item',
        LineAmount: Math.round(l.quantity * l.unitPrice * 100) / 100,
        Description: l.description.slice(0, 240),
      })),
    }
  }

  protected async createInvoice(inv: InvoiceData, _vendorExtId: string, existing: string | null, _mark: MarkCreated): Promise<string> {
    if (existing) return existing
    const bu = this.need('procurementBU', 'procurement business unit')
    this.need('supplierSite', 'default supplier site')
    const vendor = inv.vendor!
    const q = `InvoiceNumber=${qValue(inv.invoiceNumber.slice(0, 50))};BusinessUnit=${qValue(bu)}`
    const hit = OracleAdapter.firstItem(await this.api(`/invoices?onlyData=true&limit=1&fields=InvoiceId&q=${encodeURIComponent(q)}`))
    if (hit) return OracleAdapter.idOf(hit, 'InvoiceId', 'invoice lookup')
    const res = await this.api('/invoices', { method: 'POST', body: OracleAdapter.invoiceBody(inv, vendor.company_name.slice(0, 360), this.config) })
    return OracleAdapter.idOf(res, 'InvoiceId', 'invoice create')
  }
}
