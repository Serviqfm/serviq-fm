// web/src/app/api/asset-log/[id]/decommission/route.ts
// POST — decommission (status='disposed', stamps date/by/reason/disposal notes)
// or re-commission (recommission:true → clears the fields, status back to in_storage).
// admin/manager.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller, auditAssetLog } from '../../_helpers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 })

  const caller = await resolveCaller(['admin', 'manager'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, admin } = caller

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const { data: existing } = await admin
    .from('asset_log_items').select('id, status').eq('id', id).eq('organisation_id', orgId).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  let update: Record<string, unknown>
  let action: string

  if (body.recommission === true) {
    update = {
      status: 'in_storage',
      decommissioned_at: null,
      decommissioned_by: null,
      decommission_reason: null,
      disposal_notes: null,
      updated_at: new Date().toISOString(),
    }
    action = 'Re-commissioned'
  } else {
    const date = typeof body.date === 'string' && body.date.trim() !== ''
      ? body.date.trim()
      : new Date().toISOString().slice(0, 10)
    update = {
      status: 'disposed',
      decommissioned_at: date,
      decommissioned_by: userId,
      decommission_reason: typeof body.reason === 'string' ? body.reason.trim() || null : null,
      disposal_notes: typeof body.disposal_notes === 'string' ? body.disposal_notes.trim() || null : null,
      updated_at: new Date().toISOString(),
    }
    action = 'Decommissioned'
  }

  const { data: item, error } = await admin
    .from('asset_log_items').update(update).eq('id', id).eq('organisation_id', orgId).select().single()
  if (error) {
    console.error('[asset-log decommission] update failed', error)
    return NextResponse.json({ error: error.message || 'Failed to update item' }, { status: 500 })
  }

  await auditAssetLog(admin, { userId, orgId }, id, action, { new_values: { status: update.status } })
  return NextResponse.json({ item })
}
