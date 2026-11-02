// W7-02 — Supabase-backed pieces the live connectors need. SERVER ONLY: every
// function here takes the SERVICE-ROLE client and scopes by organisation_id
// itself (the service role bypasses RLS, so the org filter is the boundary).
//
//   * supabaseDataSource — loads the full vendor / PO / invoice the event is about.
//     The event payloads stay small; the adapter reads the authoritative rows.
//   * supabaseRefStore   — erp_external_refs (idempotency).
//   * loadCredentials / saveCredentials — erp_credentials (AES-256-GCM).

import type { SupabaseClient } from '@supabase/supabase-js'
import { credentialAad, decryptSecrets, encryptSecrets, secretHint } from './crypto'
import type { ConnectorProvider } from './fields'
import type { ErpDataSource, LineData, RefStore, VendorData } from './remote'

const VENDOR_COLS = 'id, company_name, vat_number, cr_number, email, phone, contact_name'

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export function supabaseDataSource(db: SupabaseClient, orgId: string): ErpDataSource {
  async function vendor(id: string | null): Promise<VendorData | null> {
    if (!id) return null
    const { data, error } = await db.from('vendors').select(VENDOR_COLS)
      .eq('id', id).eq('organisation_id', orgId).maybeSingle()
    if (error) throw new Error(`vendor lookup failed: ${error.message}`)
    return (data as VendorData | null) ?? null
  }

  return {
    vendor,

    async purchaseOrder(id) {
      const { data: po, error } = await db.from('purchase_orders')
        .select('id, po_number, notes, expected_at, sent_at, vendor_id')
        .eq('id', id).eq('organisation_id', orgId).maybeSingle()
      if (error) throw new Error(`purchase order lookup failed: ${error.message}`)
      if (!po) return null
      const { data: items, error: iErr } = await db.from('purchase_order_items')
        .select('description, quantity, unit_cost, item:item_id(name)')
        .eq('purchase_order_id', id).eq('organisation_id', orgId)
        .order('created_at', { ascending: true })
      if (iErr) throw new Error(`purchase order lines lookup failed: ${iErr.message}`)
      const lines: LineData[] = (items ?? []).map((r: Record<string, unknown>) => {
        const item = (Array.isArray(r.item) ? r.item[0] : r.item) as { name?: string } | null
        return {
          description: String(r.description || item?.name || 'Item'),
          quantity: num(r.quantity),
          unitPrice: num(r.unit_cost),
        }
      })
      return {
        id: po.id,
        poNumber: String(po.po_number),
        notes: po.notes ?? null,
        expectedAt: po.expected_at ?? null,
        sentAt: po.sent_at ?? null,
        vendor: await vendor(po.vendor_id),
        lines,
      }
    },

    async invoice(id) {
      const { data: inv, error } = await db.from('vendor_invoices')
        .select('id, invoice_number, amount, invoice_date, description, vendor_id, purchase_order_id')
        .eq('id', id).eq('organisation_id', orgId).maybeSingle()
      if (error) throw new Error(`invoice lookup failed: ${error.message}`)
      if (!inv) return null
      // Lines are optional (procurement-05); an invoice without them syncs as one line.
      const { data: lines } = await db.from('vendor_invoice_lines')
        .select('description, quantity, unit_price')
        .eq('vendor_invoice_id', id).eq('organisation_id', orgId)
        .order('created_at', { ascending: true })
      let poNumber: string | null = null
      if (inv.purchase_order_id) {
        const { data: po } = await db.from('purchase_orders').select('po_number')
          .eq('id', inv.purchase_order_id).eq('organisation_id', orgId).maybeSingle()
        if (po) poNumber = String(po.po_number)
      }
      return {
        id: inv.id,
        invoiceNumber: String(inv.invoice_number),
        amount: num(inv.amount),
        invoiceDate: inv.invoice_date ?? null,
        description: inv.description ?? null,
        poNumber,
        vendor: await vendor(inv.vendor_id),
        lines: (lines ?? []).map((l: Record<string, unknown>) => ({
          description: String(l.description || `Invoice ${inv.invoice_number}`),
          quantity: num(l.quantity),
          unitPrice: num(l.unit_price),
        })),
      }
    },
  }
}

export function supabaseRefStore(db: SupabaseClient, orgId: string, provider: ConnectorProvider): RefStore {
  return {
    async get(type, objectId) {
      const { data, error } = await db.from('erp_external_refs').select('external_id, complete')
        .eq('organisation_id', orgId).eq('provider', provider)
        .eq('object_type', type).eq('object_id', objectId).maybeSingle()
      if (error) throw new Error(`external ref lookup failed (has w7-02-erp-connectors.sql been run?)`)
      return data ? { externalId: data.external_id, complete: !!data.complete } : null
    },
    async put(type, objectId, externalId, complete) {
      const { error } = await db.from('erp_external_refs').upsert({
        organisation_id: orgId, provider, object_type: type, object_id: objectId,
        external_id: externalId, complete, updated_at: new Date().toISOString(),
      }, { onConflict: 'organisation_id,provider,object_type,object_id' })
      if (error) throw new Error(`external ref save failed (has w7-02-erp-connectors.sql been run?)`)
    },
  }
}

export type StoredCredentials = { provider: string; ciphertext: string; hints: Record<string, unknown> }

export async function readCredentialRow(db: SupabaseClient, orgId: string): Promise<StoredCredentials | null> {
  const { data, error } = await db.from('erp_credentials').select('provider, ciphertext, hints')
    .eq('organisation_id', orgId).maybeSingle()
  if (error) throw new Error('credential store unavailable (has w7-02-erp-connectors.sql been run?)')
  return (data as StoredCredentials | null) ?? null
}

/** Decrypted secrets for this org+provider, or a reason they are unavailable. */
export async function loadCredentials(
  db: SupabaseClient, orgId: string, provider: ConnectorProvider, key: Buffer,
): Promise<{ secrets: Record<string, string> } | { error: string }> {
  let row: StoredCredentials | null
  try { row = await readCredentialRow(db, orgId) } catch (e) { return { error: (e as Error).message } }
  if (!row || row.provider !== provider) return { error: 'credentials have not been saved for this provider' }
  try {
    return { secrets: decryptSecrets(row.ciphertext, key, credentialAad(orgId, provider)) }
  } catch {
    // Wrong / rotated ERP_ENCRYPTION_KEY or a tampered row. Never echo details.
    return { error: 'stored credentials could not be decrypted — re-enter them in ERP settings' }
  }
}

export async function saveCredentials(
  db: SupabaseClient, orgId: string, provider: ConnectorProvider, secrets: Record<string, string>,
  key: Buffer, userId: string | null,
): Promise<void> {
  const hints: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(secrets)) hints[k] = secretHint(v)
  const { error } = await db.from('erp_credentials').upsert({
    organisation_id: orgId,
    provider,
    ciphertext: encryptSecrets(secrets, key, credentialAad(orgId, provider)),
    hints,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organisation_id' })
  if (error) throw new Error('credential store unavailable (has w7-02-erp-connectors.sql been run?)')
}

export async function deleteCredentials(db: SupabaseClient, orgId: string): Promise<void> {
  await db.from('erp_credentials').delete().eq('organisation_id', orgId)
}
