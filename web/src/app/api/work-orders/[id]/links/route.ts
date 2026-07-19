// web/src/app/api/work-orders/[id]/links/route.ts
//
// WO-24: work-order to work-order linking. Org-scoped GET / POST / DELETE.
// One directed row per link (from_wo_id --link_type--> to_wo_id); GET returns
// links in BOTH directions for :id so the detail page can render inverse labels.
// Degrades gracefully when the work_order_links table is absent (returns []).

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const LINK_TYPES = ['blocks', 'duplicate_of', 'related'] as const
type LinkType = (typeof LINK_TYPES)[number]

async function resolveOrg(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
  if (!profile?.organisation_id) return { error: NextResponse.json({ error: 'No organisation' }, { status: 403 }) }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  return { user, orgId: profile.organisation_id as string, admin }
}

// GET — list every link touching this WO (both directions), with the other WO.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing work order id' }, { status: 400 })
  const ctx2 = await resolveOrg(req)
  if ('error' in ctx2) return ctx2.error
  const { orgId, admin } = ctx2

  const { data, error } = await admin
    .from('work_order_links')
    .select('id, from_wo_id, to_wo_id, link_type')
    .eq('organisation_id', orgId)
    .or(`from_wo_id.eq.${id},to_wo_id.eq.${id}`)
    .order('created_at', { ascending: true })
  // Table may not exist yet (migration not applied) — treat as no links.
  if (error) return NextResponse.json({ links: [] })

  const otherIds = Array.from(new Set((data ?? []).map(l => (l.from_wo_id === id ? l.to_wo_id : l.from_wo_id))))
  const woById = new Map<string, { id: string; wo_number: number | null; title: string; status: string }>()
  if (otherIds.length) {
    const { data: wos } = await admin
      .from('work_orders')
      .select('id, wo_number, title, status')
      .eq('organisation_id', orgId)
      .in('id', otherIds)
    for (const w of wos ?? []) woById.set(w.id, w)
  }

  const links = (data ?? []).map(l => {
    const outgoing = l.from_wo_id === id
    const otherId = outgoing ? l.to_wo_id : l.from_wo_id
    return {
      id: l.id,
      link_type: l.link_type as LinkType,
      direction: outgoing ? 'out' : 'in',
      other: woById.get(otherId) ?? { id: otherId, wo_number: null, title: '(unavailable)', status: '' },
    }
  })
  return NextResponse.json({ links })
}

// POST — create a link { to_wo_id, link_type } from this WO.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing work order id' }, { status: 400 })
  const ctx2 = await resolveOrg(req)
  if ('error' in ctx2) return ctx2.error
  const { user, orgId, admin } = ctx2

  const body = (await req.json().catch(() => ({}))) as { to_wo_id?: string; link_type?: string }
  const toWoId = body.to_wo_id
  const linkType = body.link_type
  if (!toWoId || !linkType || !LINK_TYPES.includes(linkType as LinkType)) {
    return NextResponse.json({ error: 'to_wo_id and a valid link_type are required' }, { status: 400 })
  }
  if (toWoId === id) return NextResponse.json({ error: 'A work order cannot link to itself' }, { status: 400 })

  // Both endpoints must belong to the caller's org (RLS enforces this too).
  const { data: endpoints } = await admin
    .from('work_orders')
    .select('id')
    .eq('organisation_id', orgId)
    .in('id', [id, toWoId])
  if (!endpoints || endpoints.length !== 2) {
    return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('work_order_links')
    .insert({ organisation_id: orgId, from_wo_id: id, to_wo_id: toWoId, link_type: linkType, created_by: user.id })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'That link already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ id: data.id })
}

// DELETE — remove a link by id (?link_id=...), scoped to the caller's org.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing work order id' }, { status: 400 })
  const ctx2 = await resolveOrg(req)
  if ('error' in ctx2) return ctx2.error
  const { orgId, admin } = ctx2

  const linkId = req.nextUrl.searchParams.get('link_id')
  if (!linkId) return NextResponse.json({ error: 'link_id is required' }, { status: 400 })

  const { error } = await admin
    .from('work_order_links')
    .delete()
    .eq('id', linkId)
    .eq('organisation_id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
