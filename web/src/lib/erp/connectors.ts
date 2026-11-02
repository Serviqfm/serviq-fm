// W7-02 — builds the live connector for an org. SERVER ONLY.
//
// buildConnector is the pure factory (tests use it with fakes). connectorForOrg
// wires it to Supabase: decrypts the org's credentials, and — when anything is
// missing (no ERP_ENCRYPTION_KEY, no saved credentials, undecryptable row) —
// returns an UnavailableConnector that logs every event as 'failed' with the
// reason, so the admin sees why in the sync log and can Retry once it's fixed.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ErpObjectType, LogWriter, SyncResult } from './index'
import { getErpEncryptionKey } from './crypto'
import { loadCredentials, supabaseDataSource, supabaseRefStore } from './data'
import type { ConnectorProvider } from './fields'
import type { FetchLike } from './http'
import { DynamicsAdapter, type DynamicsConfig } from './dynamics'
import { OdooAdapter, type OdooConfig } from './odoo'
import { OracleAdapter, type OracleConfig } from './oracle'
import type { ConnectorDeps, ErpConnector, TestResult } from './remote'
import { assertPublicHttpsUrl } from './ssrf'

export function buildConnector(
  provider: ConnectorProvider,
  config: Record<string, unknown>,
  secrets: Record<string, string>,
  deps: ConnectorDeps,
): ErpConnector {
  switch (provider) {
    case 'odoo':
      return new OdooAdapter(config as unknown as OdooConfig, { apiKey: secrets.apiKey ?? '' }, deps)
    case 'dynamics':
      return new DynamicsAdapter(config as unknown as DynamicsConfig, { clientSecret: secrets.clientSecret ?? '' }, deps)
    case 'oracle':
      return new OracleAdapter(config as unknown as OracleConfig,
        { password: secrets.password, clientSecret: secrets.clientSecret }, deps)
  }
}

/** Stands in for a connector that can't run; every push is logged 'failed' with the reason. */
export class UnavailableConnector implements ErpConnector {
  constructor(
    readonly provider: ConnectorProvider,
    private readonly orgId: string,
    private readonly writeLog: LogWriter,
    private readonly reason: string,
  ) {}

  private async fail(object_type: ErpObjectType, object_id: string | null, direction: 'push' | 'pull', payload: Record<string, unknown>): Promise<SyncResult> {
    const error = `Connector not ready: ${this.reason}`
    await this.writeLog({ organisation_id: this.orgId, provider: this.provider, object_type, object_id, direction, status: 'failed', payload, error })
    return { status: 'failed', error }
  }

  pushVendor(id: string, p: Record<string, unknown>) { return this.fail('vendor', id, 'push', p) }
  pushPO(id: string, p: Record<string, unknown>) { return this.fail('purchase_order', id, 'push', p) }
  syncInvoice(id: string, p: Record<string, unknown>) { return this.fail('invoice', id, 'push', p) }
  pushPayment(id: string, p: Record<string, unknown>) { return this.fail('payment', id, 'push', p) }
  pullBudgets(p: Record<string, unknown>) { return this.fail('budget', null, 'pull', p) }
  async testConnection(): Promise<TestResult> { return { ok: false, message: `Connector not ready: ${this.reason}` } }
}

export async function connectorForOrg(
  db: SupabaseClient,
  orgId: string,
  provider: ConnectorProvider,
  config: Record<string, unknown>,
  writeLog: LogWriter,
  opts: { fetchImpl?: FetchLike } = {},
): Promise<ErpConnector> {
  const key = getErpEncryptionKey()
  if (!key) return new UnavailableConnector(provider, orgId, writeLog, 'ERP_ENCRYPTION_KEY is not set on the server')
  const creds = await loadCredentials(db, orgId, provider, key)
  if ('error' in creds) return new UnavailableConnector(provider, orgId, writeLog, creds.error)
  return buildConnector(provider, config, creds.secrets, {
    orgId,
    writeLog,
    data: supabaseDataSource(db, orgId),
    refs: supabaseRefStore(db, orgId, provider),
    fetchImpl: opts.fetchImpl,
    guardUrl: async url => { await assertPublicHttpsUrl(url) },
  })
}
