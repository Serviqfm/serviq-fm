// P7 — ERP integration framework. ONE interface + ONE no-op implementation.
//
// ponytail: this is the whole framework on purpose. No Oracle / Dynamics / Odoo
// classes, no registry, no retry queue — live connectors are Phase Q behind an
// owner decision gate. When the first real provider lands it implements
// ErpAdapter and resolveAdapter() gains one branch; nothing else changes.
//
// The one rule that matters: an ERP problem must NEVER slow or break the flow
// that triggered it. fireErpEvent() never throws and callers `void` it, the same
// posture as lib/webhookDelivery.ts.
//
// ponytail: `void` on Next 14 / Vercel means a pending write CAN be dropped if the
// function freezes right after responding. Acceptable for a framework whose V1
// adapter only writes an audit row; upgrade path is waitUntil() from
// @vercel/functions (or after() on Next 15) once a real connector needs delivery
// guarantees.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type ErpProvider = 'oracle' | 'dynamics' | 'odoo' | 'none'
export type ErpObjectType = 'vendor' | 'purchase_order' | 'payment' | 'budget' | 'invoice'
export type SyncStatus = 'pending' | 'success' | 'failed' | 'skipped'

export type SyncResult = { status: SyncStatus; error?: string }

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
}

export type LogWriter = (row: LogRow) => Promise<void>

/**
 * V1's only adapter: records what WOULD have been synced and sends nothing.
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

/**
 * The org's adapter, or null when the org has no ACTIVE connection. Null means
 * "this tenant doesn't use ERP" and costs nothing further — no row, no write.
 * Every provider is a NoopAdapter in V1; a real connector adds one branch here.
 */
export async function resolveAdapter(orgId: string, db: SupabaseClient | null = serviceClient()): Promise<ErpAdapter | null> {
  if (!db) return null
  const { data, error } = await db
    .from('erp_connections')
    .select('provider, is_active')
    .eq('organisation_id', orgId)
    .maybeSingle()
  // Missing table (migration not run) or no row: the framework is simply off.
  if (error || !data || !data.is_active) return null

  const writeLog: LogWriter = async row => {
    const { error: insErr } = await db.from('erp_sync_log').insert(row)
    if (insErr) throw new Error(insErr.message)
  }
  return new NoopAdapter(data.provider as ErpProvider, orgId, writeLog)
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
