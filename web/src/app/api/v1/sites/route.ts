// GET /api/v1/sites — public REST, key-authenticated, org-scoped.
// Scope required: sites:read. Org comes from the API key, never the request.

import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, requireScope, parseLimit } from '../_auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await authenticateApiKey(req)
  if (ctx instanceof NextResponse) return ctx
  const scopeErr = requireScope(ctx, 'sites:read')
  if (scopeErr) return scopeErr

  const limit = parseLimit(req)
  const { data, error } = await ctx.admin
    .from('sites')
    .select('id, name, address, city, created_at')
    .eq('organisation_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[api/v1/sites] query failed', error)
    return NextResponse.json({ error: { code: 'server_error', message: 'Query failed' } }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
