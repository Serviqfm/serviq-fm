// W7-02 — Microsoft Dynamics 365 Business Central connector (API v2.0).
//
//   auth:   OAuth2 client credentials against Entra ID
//           POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
//           scope https://api.businesscentral.dynamics.com/.default
//   base:   https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}
//           /api/v2.0/companies({companyId})
//   vendor  → /vendors                 (looked up first by taxRegistrationNumber)
//   PO      → /purchaseOrders          + /purchaseOrders({id})/purchaseOrderLines
//   invoice → /purchaseInvoices        + /purchaseInvoices({id})/purchaseInvoiceLines
//             (looked up first by vendorInvoiceNumber + vendorId)
//
// Hosts are fixed Microsoft endpoints, so no SSRF check is needed; the tenant,
// environment and company values that go into the PATH are pattern-validated so
// they can't smuggle extra path segments or query strings.
//
// Header + lines is several calls, so a PO / invoice is resumable: the header id
// is stored (incomplete) as soon as it exists, and a retry adds only the lines
// that are not there yet. Lines are G/L Account lines against the configured
// account — our PO lines are free text, not BC items.

import { BC_PATTERNS } from './fields'
import { ErpRequestError, requestJson } from './http'
import {
  RemoteAdapter, invoiceLines, today,
  type ConnectorDeps, type InvoiceData, type LineData, type MarkCreated, type PoData, type TestResult, type VendorData,
} from './remote'

export type DynamicsConfig = {
  tenantId: string
  clientId: string
  environment: string
  companyId: string
  glAccountNumber?: string
}
export type DynamicsSecrets = { clientSecret: string }

export const BC_TOKEN_HOST = 'https://login.microsoftonline.com'
export const BC_API_HOST = 'https://api.businesscentral.dynamics.com'

function odataString(v: string): string {
  return `'${v.replace(/'/g, "''")}'`
}

export class DynamicsAdapter extends RemoteAdapter {
  readonly provider = 'dynamics' as const
  private token: { value: string; expiresAt: number } | null = null

  constructor(private readonly config: DynamicsConfig, private readonly secrets: DynamicsSecrets, deps: ConnectorDeps) {
    super(deps)
  }

  protected secretValues() {
    return [this.secrets.clientSecret, this.token?.value ?? '']
  }

  private checkConfig(): void {
    const c = this.config
    if (!BC_PATTERNS.tenantId.test(c.tenantId ?? '')) throw new ErpRequestError('Business Central: tenant ID is invalid')
    if (!BC_PATTERNS.clientId.test(c.clientId ?? '')) throw new ErpRequestError('Business Central: client ID is invalid')
    if (!BC_PATTERNS.environment.test(c.environment ?? '')) throw new ErpRequestError('Business Central: environment is invalid')
    if (!BC_PATTERNS.companyId.test(c.companyId ?? '')) throw new ErpRequestError('Business Central: company ID is invalid')
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value
    this.checkConfig()
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.secrets.clientSecret,
      scope: `${BC_API_HOST}/.default`,
    })
    const { body } = await requestJson(this.fetchImpl, `${BC_TOKEN_HOST}/${this.config.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(),
    }, { label: 'Business Central sign-in', timeoutMs: this.deps.timeoutMs })
    const b = body as { access_token?: unknown; expires_in?: unknown }
    if (typeof b?.access_token !== 'string') throw new ErpRequestError('Business Central sign-in: no access token returned')
    const ttl = typeof b.expires_in === 'number' ? b.expires_in : Number(b.expires_in) || 3600
    this.token = { value: b.access_token, expiresAt: Date.now() + Math.max(60, ttl - 60) * 1000 }
    return b.access_token
  }

  private companyBase(): string {
    const c = this.config
    return `${BC_API_HOST}/v2.0/${c.tenantId}/${c.environment}/api/v2.0/companies(${c.companyId})`
  }

  private async api(path: string, init: { method?: string; body?: unknown } = {}): Promise<Record<string, unknown>> {
    const token = await this.accessToken()
    const { body } = await requestJson(this.fetchImpl, `${this.companyBase()}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    }, { label: 'Business Central', timeoutMs: this.deps.timeoutMs })
    return (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  }

  private static idOf(b: Record<string, unknown>, what: string): string {
    if (typeof b.id !== 'string') throw new ErpRequestError(`Business Central: ${what} create returned no id`)
    return b.id
  }

  private static first(b: Record<string, unknown>): Record<string, unknown> | null {
    const v = Array.isArray(b.value) ? b.value : []
    return (v[0] as Record<string, unknown>) ?? null
  }

  private glAccount(): string {
    if (!this.config.glAccountNumber) {
      throw new ErpRequestError('Business Central: set a G/L account number in ERP settings (used for PO and invoice lines)')
    }
    return this.config.glAccountNumber
  }

  async testConnection(): Promise<TestResult> {
    try {
      this.checkConfig()
      const company = await this.api('')
      const name = typeof company.displayName === 'string' ? company.displayName : typeof company.name === 'string' ? company.name : ''
      return { ok: true, message: `Connected to Business Central${name ? ` company "${name}"` : ''}` }
    } catch (e) {
      return { ok: false, message: this.safeError(e) }
    }
  }

  static vendorBody(v: VendorData): Record<string, unknown> {
    return {
      displayName: v.company_name.slice(0, 100),
      ...(v.email ? { email: v.email.slice(0, 80) } : {}),
      ...(v.phone ? { phoneNumber: v.phone.slice(0, 30) } : {}),
      ...(v.vat_number ? { taxRegistrationNumber: v.vat_number.slice(0, 20) } : {}),
    }
  }

  protected async createVendor(v: VendorData): Promise<string> {
    if (v.vat_number) {
      const hit = DynamicsAdapter.first(await this.api(
        `/vendors?$filter=${encodeURIComponent(`taxRegistrationNumber eq ${odataString(v.vat_number.slice(0, 20))}`)}&$top=1`))
      if (hit && typeof hit.id === 'string') return hit.id
    }
    return DynamicsAdapter.idOf(await this.api('/vendors', { method: 'POST', body: DynamicsAdapter.vendorBody(v) }), 'vendor')
  }

  static lineBody(l: LineData, gl: string, costField: 'directUnitCost' | 'unitCost'): Record<string, unknown> {
    return {
      lineType: 'Account',
      lineObjectNumber: gl,
      description: l.description.slice(0, 100),
      quantity: l.quantity,
      [costField]: l.unitPrice,
    }
  }

  /** Add only the lines the document doesn't have yet (resumes a half-done push). */
  private async addMissingLines(collection: string, lines: LineData[], gl: string, costField: 'directUnitCost' | 'unitCost') {
    const existing = await this.api(`${collection}?$select=id`)
    const have = Array.isArray(existing.value) ? existing.value.length : 0
    for (const l of lines.slice(have)) {
      await this.api(collection, { method: 'POST', body: DynamicsAdapter.lineBody(l, gl, costField) })
    }
  }

  static poBody(po: PoData, vendorId: string): Record<string, unknown> {
    return {
      vendorId,
      orderDate: (po.sentAt ?? '').slice(0, 10) || today(),
      ...(po.expectedAt ? { requestedReceiptDate: po.expectedAt } : {}),
    }
  }

  protected async createPO(po: PoData, vendorExtId: string, existing: string | null, mark: MarkCreated): Promise<string> {
    const gl = this.glAccount()
    let id = existing
    if (!id) {
      id = DynamicsAdapter.idOf(await this.api('/purchaseOrders', { method: 'POST', body: DynamicsAdapter.poBody(po, vendorExtId) }), 'purchase order')
      await mark(id)
    }
    await this.addMissingLines(`/purchaseOrders(${id})/purchaseOrderLines`, po.lines, gl, 'directUnitCost')
    return id
  }

  static invoiceBody(inv: InvoiceData, vendorId: string): Record<string, unknown> {
    return {
      vendorId,
      vendorInvoiceNumber: inv.invoiceNumber.slice(0, 35),
      invoiceDate: inv.invoiceDate ?? today(),
    }
  }

  protected async createInvoice(inv: InvoiceData, vendorExtId: string, existing: string | null, mark: MarkCreated): Promise<string> {
    const gl = this.glAccount()
    let id = existing
    if (!id) {
      if (!BC_PATTERNS.companyId.test(vendorExtId)) throw new ErpRequestError('Business Central: stored vendor id is invalid')
      const filter = `vendorInvoiceNumber eq ${odataString(inv.invoiceNumber.slice(0, 35))} and vendorId eq ${vendorExtId}`
      const hit = DynamicsAdapter.first(await this.api(`/purchaseInvoices?$filter=${encodeURIComponent(filter)}&$top=1`))
      if (hit && typeof hit.id === 'string') id = hit.id
      else {
        id = DynamicsAdapter.idOf(await this.api('/purchaseInvoices', { method: 'POST', body: DynamicsAdapter.invoiceBody(inv, vendorExtId) }), 'purchase invoice')
      }
      await mark(id)
    }
    await this.addMissingLines(`/purchaseInvoices(${id})/purchaseInvoiceLines`, invoiceLines(inv), gl, 'unitCost')
    return id
  }
}
