// web/src/app/api/erp/retry/route.ts — W7-02, ADMIN ONLY.
// POST { log_id } — re-run a FAILED sync-log row through the org's current
// adapter. Safe to repeat: connectors look up erp_external_refs (and the ERP
// itself) before creating, so a retry never duplicates an object that already
// made it across. The retry appends its own sync-log row; the failed row stays
// as history (the log is append-only).

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'
import { dispatch, eventForObjectType, resolveAdapter } from '@/lib/erp'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(['admin'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const body = (await req.json().catch(() => ({}))) as { log_id?: unknown }
  const logId = typeof body.log_id === 'string' ? body.log_id : ''
  if (!logId) return NextResponse.json({ error: 'log_id is required' }, { status: 400 })

  const { data: row } = await admin.from('erp_sync_log')
    .select('id, object_type, object_id, status, payload')
    .eq('id', logId).eq('organisation_id', orgId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Sync log entry not found' }, { status: 404 })
  if (row.status !== 'failed') return NextResponse.json({ error: 'Only failed entries can be retried' }, { status: 409 })
  const event = eventForObjectType(row.object_type)
  if (!event || !row.object_id) return NextResponse.json({ error: 'This entry cannot be retried' }, { status: 400 })

  const adapter = await resolveAdapter(orgId, admin)
  if (!adapter) return NextResponse.json({ error: 'The ERP connection is switched off' }, { status: 409 })

  try {
    const result = await dispatch(adapter, event, row.object_id, (row.payload ?? {}) as Record<string, unknown>)
    return NextResponse.json({ result })
  } catch (e) {
    console.error('[erp retry] failed', (e as Error)?.name)
    return NextResponse.json({ error: 'Retry could not be recorded' }, { status: 500 })
  }
}
