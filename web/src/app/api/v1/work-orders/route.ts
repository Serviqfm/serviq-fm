// GET /api/v1/work-orders — public REST, key-authenticated, org-scoped.
// Scope required: work-orders:read. Org comes from the API key, never the request.
//
// POST /api/v1/work-orders — create a work order (MKT-19).
// Scope required: work-orders:write. Org comes from the key; site_id/asset_id (if
// given) are verified to belong to that org before insert (service-role bypasses RLS).

import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, requireScope, parseLimit, jsonError } from '../_auth'
import { planAllowsApiAccess } from '@/lib/planLimits'
import { deliverWebhookEvent } from '@/lib/webhookDelivery'

export const dynamic = 'force-dynamic'

const PRIORITIES = ['low', 'medium', 'high', 'critical']

export async function GET(req: NextRequest) {
  const ctx = await authenticateApiKey(req)
  if (ctx instanceof NextResponse) return ctx
  const scopeErr = requireScope(ctx, 'work-orders:read')
  if (scopeErr) return scopeErr

  const limit = parseLimit(req)
  const { data, error } = await ctx.admin
    .from('work_orders')
    .select('id, wo_number, title, description, status, priority, category, site_id, asset_id, assigned_to, due_at, completed_at, created_at')
    .eq('organisation_id', ctx.orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[api/v1/work-orders] query failed', error)
    return NextResponse.json({ error: { code: 'server_error', message: 'Query failed' } }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await authenticateApiKey(req)
  if (ctx instanceof NextResponse) return ctx
  const scopeErr = requireScope(ctx, 'work-orders:write')
  if (scopeErr) return scopeErr

  // Respect the plan's api_access flag. FAIL OPEN — unknown/null tier or lookup
  // error allows the write, matching key issuance (AP-12) so existing orgs never break.
  const { data: orgRow } = await ctx.admin
    .from('organisations').select('plan_tier').eq('id', ctx.orgId).single()
  if (!planAllowsApiAccess(orgRow?.plan_tier as string | null | undefined)) {
    return jsonError(403, 'plan_forbidden', 'API access is not included in your plan')
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return jsonError(400, 'invalid_request', 'title is required')

  const priority = typeof body.priority === 'string' && PRIORITIES.includes(body.priority) ? body.priority : 'medium'
  const description = typeof body.description === 'string' && body.description.trim() !== '' ? body.description.trim() : null
  const category = typeof body.category === 'string' && body.category.trim() !== '' ? body.category.trim() : null
  const dueAt = typeof body.due_at === 'string' && body.due_at.trim() !== '' ? body.due_at : null
  const siteId = typeof body.site_id === 'string' && body.site_id.trim() !== '' ? body.site_id.trim() : null
  const assetId = typeof body.asset_id === 'string' && body.asset_id.trim() !== '' ? body.asset_id.trim() : null

  // Trust-boundary: a caller could name a site/asset from another org. The org is
  // fixed to the key's org, so verify any referenced FK actually belongs to it.
  if (siteId) {
    const { data: site } = await ctx.admin.from('sites').select('id').eq('id', siteId).eq('organisation_id', ctx.orgId).maybeSingle()
    if (!site) return jsonError(400, 'invalid_request', 'site_id not found in your organisation')
  }
  if (assetId) {
    const { data: asset } = await ctx.admin.from('assets').select('id').eq('id', assetId).eq('organisation_id', ctx.orgId).maybeSingle()
    if (!asset) return jsonError(400, 'invalid_request', 'asset_id not found in your organisation')
  }

  const { data, error } = await ctx.admin
    .from('work_orders')
    .insert({
      organisation_id: ctx.orgId,
      title,
      description,
      priority,
      category,
      site_id: siteId,
      asset_id: assetId,
      due_at: dueAt,
      status: 'new',
      source: 'manual',
    })
    .select('id, wo_number, title, description, status, priority, category, site_id, asset_id, due_at, created_at')
    .single()

  if (error) {
    console.error('[api/v1/work-orders POST] insert failed', error)
    return jsonError(500, 'server_error', 'Failed to create work order')
  }

  // Parity with the dashboard create path: fire wo.created to registered webhooks.
  void deliverWebhookEvent(ctx.orgId, 'wo.created', {
    id: data?.id ?? null,
    wo_number: data?.wo_number ?? null,
    title: data?.title ?? null,
    status: data?.status ?? null,
    priority: data?.priority ?? null,
    site_id: data?.site_id ?? null,
    asset_id: data?.asset_id ?? null,
  })

  return NextResponse.json({ data }, { status: 201 })
}
