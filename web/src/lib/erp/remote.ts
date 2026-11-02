// W7-02 — shared machinery for the three live connectors (odoo.ts, dynamics.ts,
// oracle.ts). A provider only writes the three "create" calls + testConnection;
// this base class owns everything that must be identical across providers:
//
//   * IDEMPOTENCY via erp_external_refs: an object already synced (complete ref)
//     short-circuits to 'success' without calling the ERP; a half-done multi-step
//     create (BC header made, lines not) resumes from the stored external id.
//     Vendors are ensured before a PO / invoice that needs them, so a vendor that
//     existed before the connection was switched on still gets created once.
//   * Exactly one sync-log row per attempt — 'success' with the external id, or
//     'failed' with a SAFE message (redacted of every secret value).
//   * pushPayment / pullBudgets have no V1 caller; they log 'skipped'.

import type { ErpAdapter, ErpObjectType, LogWriter, SyncResult } from './index'
import { ErpRequestError, redact, type FetchLike } from './http'

export type VendorData = {
  id: string
  company_name: string
  vat_number: string | null
  cr_number: string | null
  email: string | null
  phone: string | null
  contact_name: string | null
}

export type LineData = { description: string; quantity: number; unitPrice: number }

export type PoData = {
  id: string
  poNumber: string
  notes: string | null
  expectedAt: string | null // YYYY-MM-DD
  sentAt: string | null
  vendor: VendorData | null
  lines: LineData[]
}

export type InvoiceData = {
  id: string
  invoiceNumber: string
  amount: number
  invoiceDate: string | null // YYYY-MM-DD
  description: string | null
  poNumber: string | null
  vendor: VendorData | null
  lines: LineData[]
}

export interface ErpDataSource {
  vendor(id: string): Promise<VendorData | null>
  purchaseOrder(id: string): Promise<PoData | null>
  invoice(id: string): Promise<InvoiceData | null>
}

export type RefType = 'vendor' | 'purchase_order' | 'invoice'
export type ExternalRef = { externalId: string; complete: boolean }

export interface RefStore {
  get(type: RefType, objectId: string): Promise<ExternalRef | null>
  put(type: RefType, objectId: string, externalId: string, complete: boolean): Promise<void>
}

export type TestResult = { ok: boolean; message: string }

export type ConnectorDeps = {
  orgId: string
  writeLog: LogWriter
  data: ErpDataSource
  refs: RefStore
  fetchImpl?: FetchLike
  /** SSRF check run before each request to a user-supplied host. */
  guardUrl?: (url: string) => Promise<void>
  timeoutMs?: number
}

/** A live connector: the ErpAdapter contract plus a connection test. */
export interface ErpConnector extends ErpAdapter {
  testConnection(): Promise<TestResult>
}

/** Mark a create step as done-but-incomplete so a retry resumes rather than duplicates. */
export type MarkCreated = (externalId: string) => Promise<void>

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** A payload-free invoice line set: the invoice's own lines, or one line for the total. */
export function invoiceLines(inv: InvoiceData): LineData[] {
  return inv.lines.length
    ? inv.lines
    : [{ description: inv.description || `Invoice ${inv.invoiceNumber}`, quantity: 1, unitPrice: inv.amount }]
}

export abstract class RemoteAdapter implements ErpConnector {
  abstract readonly provider: 'odoo' | 'dynamics' | 'oracle'
  protected readonly fetchImpl: FetchLike

  constructor(protected readonly deps: ConnectorDeps) {
    this.fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init))
  }

  /** Every secret value this adapter holds, for redaction. */
  protected abstract secretValues(): string[]
  abstract testConnection(): Promise<TestResult>
  /** Create (or find remotely) the vendor; returns its external id. */
  protected abstract createVendor(v: VendorData): Promise<string>
  protected abstract createPO(po: PoData, vendorExtId: string, existing: string | null, mark: MarkCreated): Promise<string>
  protected abstract createInvoice(inv: InvoiceData, vendorExtId: string, existing: string | null, mark: MarkCreated): Promise<string>

  /** Error → message safe for the sync log and the API response. */
  protected safeError(e: unknown): string {
    const raw = e instanceof ErpRequestError ? e.safeMessage : `${this.label()}: unexpected connector error`
    if (!(e instanceof ErpRequestError)) {
      // Server log only, and still redacted: unknown errors could carry anything.
      console.error(`[erp:${this.provider}] unexpected error`, redact(String((e as Error)?.message ?? e), this.secretValues()))
    }
    return redact(raw, this.secretValues())
  }

  protected label(): string {
    return this.provider === 'odoo' ? 'Odoo' : this.provider === 'dynamics' ? 'Business Central' : 'Oracle'
  }

  protected async guard(url: string): Promise<void> {
    if (this.deps.guardUrl) {
      try { await this.deps.guardUrl(url) } catch (e) {
        throw new ErpRequestError(`${this.label()}: blocked URL — ${(e as Error).message}`)
      }
    }
  }

  protected async ensureVendor(v: VendorData): Promise<string> {
    const ref = await this.deps.refs.get('vendor', v.id)
    if (ref?.complete) return ref.externalId
    const ext = await this.createVendor(v)
    await this.deps.refs.put('vendor', v.id, ext, true)
    return ext
  }

  private async run(
    object_type: ErpObjectType,
    objectId: string,
    payload: Record<string, unknown>,
    work: () => Promise<string>,
  ): Promise<SyncResult> {
    let result: SyncResult
    try {
      const externalId = await work()
      result = { status: 'success', externalId }
    } catch (e) {
      result = { status: 'failed', error: this.safeError(e) }
    }
    await this.deps.writeLog({
      organisation_id: this.deps.orgId,
      provider: this.provider,
      object_type,
      object_id: objectId,
      direction: 'push',
      status: result.status,
      payload,
      error: result.error ?? null,
      ...(result.externalId ? { external_id: result.externalId } : {}),
    })
    return result
  }

  pushVendor(vendorId: string, payload: Record<string, unknown>): Promise<SyncResult> {
    return this.run('vendor', vendorId, payload, async () => {
      const v = await this.deps.data.vendor(vendorId)
      if (!v) throw new ErpRequestError('Vendor not found')
      return this.ensureVendor(v)
    })
  }

  pushPO(poId: string, payload: Record<string, unknown>): Promise<SyncResult> {
    return this.run('purchase_order', poId, payload, async () => {
      const ref = await this.deps.refs.get('purchase_order', poId)
      if (ref?.complete) return ref.externalId
      const po = await this.deps.data.purchaseOrder(poId)
      if (!po) throw new ErpRequestError('Purchase order not found')
      if (!po.vendor) throw new ErpRequestError('Purchase order has no vendor')
      if (!po.lines.length) throw new ErpRequestError('Purchase order has no lines')
      const vendorExt = await this.ensureVendor(po.vendor)
      const ext = await this.createPO(po, vendorExt, ref?.externalId ?? null,
        id => this.deps.refs.put('purchase_order', poId, id, false))
      await this.deps.refs.put('purchase_order', poId, ext, true)
      return ext
    })
  }

  syncInvoice(invoiceId: string, payload: Record<string, unknown>): Promise<SyncResult> {
    return this.run('invoice', invoiceId, payload, async () => {
      const ref = await this.deps.refs.get('invoice', invoiceId)
      if (ref?.complete) return ref.externalId
      const inv = await this.deps.data.invoice(invoiceId)
      if (!inv) throw new ErpRequestError('Invoice not found')
      if (!inv.vendor) throw new ErpRequestError('Invoice has no vendor')
      const vendorExt = await this.ensureVendor(inv.vendor)
      const ext = await this.createInvoice(inv, vendorExt, ref?.externalId ?? null,
        id => this.deps.refs.put('invoice', invoiceId, id, false))
      await this.deps.refs.put('invoice', invoiceId, ext, true)
      return ext
    })
  }

  private async unsupported(object_type: ErpObjectType, id: string | null, direction: 'push' | 'pull', payload: Record<string, unknown>): Promise<SyncResult> {
    const error = `Not supported by the ${this.label()} connector yet`
    await this.deps.writeLog({
      organisation_id: this.deps.orgId, provider: this.provider, object_type, object_id: id,
      direction, status: 'skipped', payload, error,
    })
    return { status: 'skipped', error }
  }

  pushPayment(id: string, payload: Record<string, unknown>) { return this.unsupported('payment', id, 'push', payload) }
  pullBudgets(payload: Record<string, unknown>) { return this.unsupported('budget', null, 'pull', payload) }
}
