// P7 — ERP integration framework: ONE interface, a no-op implementation, and
// (W7-02) three live connectors — Odoo, Business Central, Oracle Fusion — in
// sibling files that implement the same ErpAdapter contract. resolveAdapter()
// picks the org's provider; nothing else in the app knows which ERP is behind it.
//
// The one rule that matters: an ERP problem must NEVER slow or break the flow
// that triggered it. fireErpEvent() never throws and callers `void` it, the same
// posture as lib/webhookDelivery.ts. A connector failure is logged 'failed' in
// erp_sync_log (with a secret-free message) and can be retried from settings.
//
// Callers that must not delay their response wrap the call in waitUntil() from
// @vercel/functions (PO send, invoice approval) so Vercel keeps the function alive
// until the push finishes instead of freezing it mid-request. Never use bare `void`.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { connectorForOrg } from './connectors'
import { isConnectorProvider } from './fields'

export type ErpProvider = 'oracle' | 'dynamics' | 'odoo' | 'none'
export type ErpObjectType = 'vendor' | 'purchase_order' | 'payment' | 'budget' | 'invoice'
export type SyncStatus = 'pending' | 'success' | 'failed' | 'skipped'

export type SyncResult = { status: SyncStatus; error?: string; externalId?: string }

/** The contract every provider implements. Payloads carry business identifiers — never secrets. */
export interface ErpAdapter {
  readonly provider: ErpProvider
  pushVendor(vendorId: string, payload: Record<string, unknown>): Promise<SyncResult>
  pushPO(purchaseOrderId: string, payload: Record<string, unknown>): Promise<SyncResult>
  pushPayment(paymentId: string, payload: Record<string, unknown>): Promise<SyncResult>
  pullBudgets(payload: Record<string, unknown>): Promise<SyncResult>
  syncInvoice(invoiceId: string, payload: Record<string, unknown>): Promise<SyncResult>
}

export type LogRow = {
  organisation_id: string
  provider: ErpProvider
  object_type: ErpObjectType
  object_id: string | null
  direction: 'push' | 'pull'
  status: SyncStatus
  payload: Record<string, unknown> | null
  error: string | null
  /** The ERP's id for the object, on a successful live push (w7-02 column). */
  external_id?: string
}

export type LogWriter = (row: LogRow) => Promise<void>

/**
 * The 'none' provider's adapter: records what WOULD have been synced and sends nothing.
 * Every call resolves 'skipped' — never 'success', because nothing was delivered
 * and the log must not claim otherwise.
 */
export class NoopAdapter implements ErpAdapter {
  constructor(
    readonly provider: ErpProvider,
    private readonly orgId: string,
    private readonly writeLog: LogWriter,
  ) {}

  private async record(
    object_type: ErpObjectType,
    object_id: string | null,
    direction: 'push' | 'pull',
    payload: Record<string, unknown>,
  ): Promise<SyncResult> {
    await this.writeLog({
      organisation_id: this.orgId,
      provider: this.provider,
      object_type,
      object_id,
      direction,
      status: 'skipped',
      payload,
      error: null,
    })
    return { status: 'skipped' }
  }

  pushVendor(id: string, payload: Record<string, unknown>) { return this.record('vendor', id, 'push', payload) }
  pushPO(id: string, payload: Record<string, unknown>) { return this.record('purchase_order', id, 'push', payload) }
  pushPayment(id: string, payload: Record<string, unknown>) { return this.record('payment', id, 'push', payload) }
  pullBudgets(payload: Record<string, unknown>) { return this.record('budget', null, 'pull', payload) }
  syncInvoice(id: string, payload: Record<string, unknown>) { return this.record('invoice', id, 'push', payload) }
}

/** The events V1 actually emits. pushPayment / pullBudgets have no V1 caller yet. */
export type ErpEvent = 'vendor.created' | 'po.sent' | 'invoice.approved'

/** Which adapter method an event drives. Pure, so the mapping is testable. */
export function dispatch(
  adapter: ErpAdapter,
  event: ErpEvent,
  objectId: string,
  payload: Record<string, unknown>,
): Promise<SyncResult> {
  switch (event) {
    case 'vendor.created': return adapter.pushVendor(objectId, payload)
    case 'po.sent': return adapter.pushPO(objectId, payload)
    case 'invoice.approved': return adapter.syncInvoice(objectId, payload)
  }
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function erpLogWriter(db: SupabaseClient): LogWriter {
  return async row => {
    const { error: insErr } = await db.from('erp_sync_log').insert(row)
    if (insErr) throw new Error(insErr.message)
  }
}

/**
 * The org's adapter, or null when the org has no ACTIVE connection. Null means
 * "this tenant doesn't use ERP" and costs nothing further — no row, no write.
 * Provider 'none' → NoopAdapter (records, sends nothing); odoo / dynamics /
 * oracle → the live connector (or an UnavailableConnector that logs 'failed'
 * when its credentials / encryption key are missing).
 */
export async function resolveAdapter(orgId: string, db: SupabaseClient | null = serviceClient()): Promise<ErpAdapter | null> {
  if (!db) return null
  const { data, error } = await db
    .from('erp_connections')
    .select('provider, is_active, config')
    .eq('organisation_id', orgId)
    .maybeSingle()
  // Missing table (migration not run) or no row: the framework is simply off.
  if (error || !data || !data.is_active) return null

  const writeLog = erpLogWriter(db)
  if (isConnectorProvider(data.provider)) {
    return connectorForOrg(db, orgId, data.provider, (data.config ?? {}) as Record<string, unknown>, writeLog)
  }
  return new NoopAdapter(data.provider as ErpProvider, orgId, writeLog)
}

/** Which event re-drives a sync-log row on Retry. payment / budget have no event. */
export function eventForObjectType(t: string): ErpEvent | null {
  return t === 'vendor' ? 'vendor.created' : t === 'purchase_order' ? 'po.sent' : t === 'invoice' ? 'invoice.approved' : null
}

/**
 * Fire an ERP event. NEVER throws and never rejects: every failure — no service
 * key, missing table, a broken adapter — is logged and swallowed. Callers `void`
 * it so the triggering request pays no latency.
 */
export async function fireErpEvent(
  orgId: string,
  event: ErpEvent,
  objectId: string,
  payload: Record<string, unknown>,
  resolve: (orgId: string) => Promise<ErpAdapter | null> = resolveAdapter,
): Promise<void> {
  try {
    const adapter = await resolve(orgId)
    if (!adapter) return
    await dispatch(adapter, event, objectId, payload)
  } catch (e) {
    console.error(`[erp] ${event} for ${objectId} failed (swallowed)`, e)
  }
}
