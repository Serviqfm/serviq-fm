// GET /api/v1/assets — public REST, key-authenticated, org-scoped.
// Scope required: assets:read. Org comes from the API key, never the request.

import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, requireScope, parseLimit } from '../_auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await authenticateApiKey(req)
  if (ctx instanceof NextResponse) return ctx
  const scopeErr = requireScope(ctx, 'assets:read')
  if (scopeErr) return scopeErr

  const limit = parseLimit(req)
  const { data, error } = await ctx.admin
    .from('assets')
    .select('id, name, category, status, site_id, space_id, serial_number, manufacturer, model, purchase_date, warranty_expiry, created_at')
    .eq('organisation_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[api/v1/assets] query failed', error)
    return NextResponse.json({ error: { code: 'server_error', message: 'Query failed' } }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
