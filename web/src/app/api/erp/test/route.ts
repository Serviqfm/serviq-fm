// web/src/app/api/erp/test/route.ts — W7-02, ADMIN ONLY.
// POST — test the SAVED connection (save first, then test): authenticates against
// the ERP and makes one harmless read. Returns { ok, message }; the message is
// the connector's safe message (no secrets, no headers). The result is stamped
// on erp_connections.last_test_* so the page can show it later.

import { NextResponse } from 'next/server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'
import { erpLogWriter } from '@/lib/erp'
import { connectorForOrg } from '@/lib/erp/connectors'
import { isConnectorProvider } from '@/lib/erp/fields'

export const dynamic = 'force-dynamic'

export async function POST() {
  const caller = await resolveCaller(['admin'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const { data: conn, error } = await admin.from('erp_connections').select('provider, config')
    .eq('organisation_id', orgId).maybeSingle()
  if (error) return NextResponse.json({ error: 'ERP integration is unavailable' }, { status: 503 })
  if (!conn || !isConnectorProvider(conn.provider)) {
    return NextResponse.json({ ok: false, message: 'Save a live provider (Odoo, Business Central or Oracle) first' })
  }

  let result: { ok: boolean; message: string }
  try {
    const connector = await connectorForOrg(admin, orgId, conn.provider, (conn.config ?? {}) as Record<string, unknown>, erpLogWriter(admin))
    result = await connector.testConnection()
  } catch {
    result = { ok: false, message: 'Connection test failed unexpectedly' }
  }

  // Best effort — the columns only exist after w7-02.
  await admin.from('erp_connections').update({
    last_test_at: new Date().toISOString(), last_test_ok: result.ok, last_test_message: result.message.slice(0, 500),
  }).eq('organisation_id', orgId)

  return NextResponse.json(result)
}
