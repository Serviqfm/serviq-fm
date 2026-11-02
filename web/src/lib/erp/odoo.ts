// W7-02 — Odoo connector over the external JSON-RPC API (`POST {base}/jsonrpc`).
//
//   auth:    common.authenticate(db, login, apiKey, {}) → uid (false = bad creds)
//   calls:   object.execute_kw(db, uid, apiKey, model, method, args, kwargs)
//   vendor   → res.partner        (supplier_rank 1, ref "SERVIQ-<uuid>")
//   PO       → purchase.order     (origin "SERVIQ-PO-<n>", order_line one2many)
//   invoice  → account.move       (move_type in_invoice, ref = vendor invoice no.)
//
// Each create is preceded by a search on the marker field, so even if our own
// ref row failed to save after a successful create, a retry finds the record
// instead of duplicating it. The API key travels only in the JSON body; RPC
// error `data.debug` (a server traceback) is never surfaced.

import { ErpRequestError, requestJson, truncate } from './http'
import {
  RemoteAdapter, invoiceLines, today,
  type ConnectorDeps, type InvoiceData, type MarkCreated, type PoData, type TestResult, type VendorData,
} from './remote'

export type OdooConfig = { baseUrl: string; database: string; username: string; defaultProductId?: string }
export type OdooSecrets = { apiKey: string }

type RpcError = { code?: number; message?: string; data?: { name?: string; message?: string } }

export class OdooAdapter extends RemoteAdapter {
  readonly provider = 'odoo' as const
  private uid: number | null = null
  private seq = 0

  constructor(private readonly config: OdooConfig, private readonly secrets: OdooSecrets, deps: ConnectorDeps) {
    super(deps)
  }

  protected secretValues() { return [this.secrets.apiKey] }

  private endpoint(): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}/jsonrpc`
  }

  private async rpc(service: string, method: string, args: unknown[]): Promise<unknown> {
    const url = this.endpoint()
    await this.guard(url)
    const { body } = await requestJson(this.fetchImpl, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: ++this.seq }),
    }, { label: 'Odoo', timeoutMs: this.deps.timeoutMs })
    if (!body || typeof body !== 'object') throw new ErpRequestError('Odoo: unexpected response (is this an Odoo URL?)')
    const b = body as { result?: unknown; error?: RpcError }
    if (b.error) {
      const name = b.error.data?.name ?? ''
      const msg = b.error.data?.message || b.error.message || 'RPC error'
      const auth = /AccessDenied|AccessError/.test(name) ? ' — check the username and API key' : ''
      throw new ErpRequestError(`Odoo: ${truncate(msg)}${auth}`)
    }
    return b.result
  }

  private async login(): Promise<number> {
    if (this.uid) return this.uid
    const uid = await this.rpc('common', 'authenticate', [this.config.database, this.config.username, this.secrets.apiKey, {}])
    if (typeof uid !== 'number' || !uid) {
      throw new ErpRequestError('Odoo: authentication failed — check the database, username and API key')
    }
    this.uid = uid
    return uid
  }

  private async kw(model: string, method: string, args: unknown[], kwargs: Record<string, unknown> = {}): Promise<unknown> {
    const uid = await this.login()
    return this.rpc('object', 'execute_kw', [this.config.database, uid, this.secrets.apiKey, model, method, args, kwargs])
  }

  private async findOne(model: string, domain: unknown[]): Promise<string | null> {
    const ids = await this.kw(model, 'search', [domain], { limit: 1 })
    return Array.isArray(ids) && typeof ids[0] === 'number' ? String(ids[0]) : null
  }

  private async create(model: string, values: Record<string, unknown>): Promise<string> {
    const id = await this.kw(model, 'create', [values])
    // create() returns an int (or a one-element list on newer multi-create builds).
    const n = Array.isArray(id) ? id[0] : id
    if (typeof n !== 'number') throw new ErpRequestError(`Odoo: ${model} create returned no id`)
    return String(n)
  }

  private productId(): number {
    const p = Number(this.config.defaultProductId)
    if (!this.config.defaultProductId || !Number.isInteger(p) || p <= 0) {
      throw new ErpRequestError('Odoo: set a default product ID in ERP settings (required on purchase order lines)')
    }
    return p
  }

  async testConnection(): Promise<TestResult> {
    try {
      const ver = await this.rpc('common', 'version', []) as { server_version?: string } | null
      const uid = await this.login()
      return { ok: true, message: `Connected to Odoo ${ver?.server_version ?? ''} as user #${uid}`.replace(/\s+/g, ' ') }
    } catch (e) {
      return { ok: false, message: this.safeError(e) }
    }
  }

  static vendorValues(v: VendorData): Record<string, unknown> {
    const out: Record<string, unknown> = {
      name: v.company_name,
      is_company: true,
      supplier_rank: 1,
      ref: `SERVIQ-${v.id}`,
    }
    if (v.vat_number) out.vat = v.vat_number
    if (v.email) out.email = v.email
    if (v.phone) out.phone = v.phone
    if (v.cr_number) out.comment = `CR: ${v.cr_number}`
    return out
  }

  protected async createVendor(v: VendorData): Promise<string> {
    const found = await this.findOne('res.partner', [['ref', '=', `SERVIQ-${v.id}`]])
    return found ?? this.create('res.partner', OdooAdapter.vendorValues(v))
  }

  static poValues(po: PoData, partnerId: number, productId: number): Record<string, unknown> {
    const planned = `${po.expectedAt ?? today()} 00:00:00`
    return {
      partner_id: partnerId,
      origin: `SERVIQ-PO-${po.poNumber}`,
      date_planned: planned,
      ...(po.notes ? { notes: po.notes } : {}),
      order_line: po.lines.map(l => [0, 0, {
        name: l.description,
        product_id: productId,
        product_qty: l.quantity,
        price_unit: l.unitPrice,
        date_planned: planned,
      }]),
    }
  }

  protected async createPO(po: PoData, vendorExtId: string, existing: string | null, _mark: MarkCreated): Promise<string> {
    // purchase.order + its lines is one atomic create, so there is no partial state to resume.
    if (existing) return existing
    const partnerId = Number(vendorExtId)
    const productId = this.productId()
    const found = await this.findOne('purchase.order', [['origin', '=', `SERVIQ-PO-${po.poNumber}`], ['partner_id', '=', partnerId]])
    return found ?? this.create('purchase.order', OdooAdapter.poValues(po, partnerId, productId))
  }

  static invoiceValues(inv: InvoiceData, partnerId: number, productId: number | null): Record<string, unknown> {
    return {
      move_type: 'in_invoice',
      partner_id: partnerId,
      ref: inv.invoiceNumber,
      invoice_date: inv.invoiceDate ?? today(),
      ...(inv.poNumber ? { invoice_origin: `SERVIQ-PO-${inv.poNumber}` } : {}),
      ...(inv.description ? { narration: inv.description } : {}),
      invoice_line_ids: invoiceLines(inv).map(l => [0, 0, {
        name: l.description,
        quantity: l.quantity,
        price_unit: l.unitPrice,
        ...(productId ? { product_id: productId } : {}),
      }]),
    }
  }

  protected async createInvoice(inv: InvoiceData, vendorExtId: string, existing: string | null, _mark: MarkCreated): Promise<string> {
    if (existing) return existing
    const partnerId = Number(vendorExtId)
    const found = await this.findOne('account.move', [
      ['move_type', '=', 'in_invoice'], ['partner_id', '=', partnerId], ['ref', '=', inv.invoiceNumber],
    ])
    const p = Number(this.config.defaultProductId)
    return found ?? this.create('account.move', OdooAdapter.invoiceValues(inv, partnerId, Number.isInteger(p) && p > 0 ? p : null))
  }
}
