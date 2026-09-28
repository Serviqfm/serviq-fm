// POST { token, session_id, title, justification, needed_by, requester_name, lines }
// — step 3: create the requisition and push it straight into approval.
//
// created_by stays NULL (there is no user account behind a portal request) and
// requester_email is the address that proved it owns the mailbox. That pair is
// exactly what submit_portal_requisition() insists on, and it is service-role
// only — a signed-in caller cannot reach it.
//
// Stock lines reserve inside that RPC, under a row lock, so the portal cannot
// over-draw the shelf however many people scan the QR at once.

import { NextRequest, NextResponse } from 'next/server'
import { adminClient, siteByToken, verifiedSession } from '../_shared'
import { parseStockError } from '@/lib/stock'
import { notifyCurrentApprover } from '@/app/api/procurement/requisitions/_notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LINES = 50

type LineInput = { item_id?: unknown; description?: unknown; quantity?: unknown; line_type?: unknown }

function str(v: unknown, max = 500): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : ''

  const admin = adminClient()
  const site = await siteByToken(admin, token)
  if (!site) return NextResponse.json({ error: 'This QR code is not valid.' }, { status: 404 })

  const session = await verifiedSession(admin, sessionId, site.id)
  if (!session) {
    return NextResponse.json(
      { error: 'Your session expired. Ask for a new code.', code: 'session_expired' },
      { status: 401 }
    )
  }

  const title = str(body.title, 200)
  if (!title) return NextResponse.json({ error: 'Describe what you need in the title.' }, { status: 400 })

  const rawLines = (Array.isArray(body.lines) ? body.lines : []) as LineInput[]
  if (rawLines.length === 0 || rawLines.length > MAX_LINES) {
    return NextResponse.json({ error: 'Add between one and 50 lines.' }, { status: 400 })
  }

  // Stock lines must name an item that belongs to THIS site — the picker only
  // offers those, but the check is here because the body is the caller's.
  const stockIds = Array.from(new Set(
    rawLines.filter(l => l.line_type === 'stock').map(l => str(l.item_id)).filter(Boolean)
  )) as string[]
  if (stockIds.length > 0) {
    const { data: found } = await admin
      .from('inventory_items').select('id')
      .eq('organisation_id', site.organisation_id).eq('site_id', site.id).in('id', stockIds)
    const ok = new Set((found ?? []).map(i => i.id))
    if (stockIds.some(id => !ok.has(id))) {
      return NextResponse.json({ error: 'One of those items is not stocked at this site.' }, { status: 400 })
    }
  }

  const lines = rawLines.map(l => {
    const type = l.line_type === 'stock' ? 'stock' : 'purchase'
    const qty = Number(l.quantity)
    return {
      item_id: type === 'stock' ? str(l.item_id) : null,
      description: str(l.description, 300),
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      line_type: type,
    }
  })
  if (lines.some(l => l.line_type === 'stock' && !l.item_id)) {
    return NextResponse.json({ error: 'A stock line must name its item.' }, { status: 400 })
  }
  if (lines.some(l => l.line_type === 'purchase' && !l.description)) {
    return NextResponse.json({ error: 'Describe each item you need.' }, { status: 400 })
  }

  const { data: requisition, error: reqErr } = await admin
    .from('requisitions')
    .insert({
      organisation_id: site.organisation_id,
      site_id: site.id,
      created_by: null,
      requester_email: session.email,
      requester_name: str(body.requester_name, 120),
      title,
      justification: str(body.justification, 2000),
      needed_by: str(body.needed_by, 10),
      status: 'draft',
    })
    .select('id, requisition_number')
    .single()
  if (reqErr || !requisition) {
    console.error('[requisition-portal submit] header insert failed', reqErr)
    return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 })
  }

  // Stock lines are valued from the shelf so the approval band sees a real
  // number; the portal never lets a requester type a price.
  const costs = new Map<string, number>()
  if (stockIds.length > 0) {
    const { data: priced } = await admin
      .from('inventory_items').select('id, unit_cost').in('id', stockIds)
    for (const p of priced ?? []) costs.set(p.id as string, Number(p.unit_cost ?? 0))
  }

  const { error: liErr } = await admin.from('requisition_items').insert(
    lines.map(l => ({
      organisation_id: site.organisation_id,
      requisition_id: requisition.id,
      item_id: l.item_id,
      description: l.description,
      quantity: l.quantity,
      unit_cost: l.item_id ? costs.get(l.item_id) ?? 0 : 0,
      line_type: l.line_type,
    }))
  )
  if (liErr) {
    await admin.from('requisitions').delete().eq('id', requisition.id)
    console.error('[requisition-portal submit] line insert failed', liErr)
    return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 })
  }

  const { data: submitted, error: rpcErr } = await admin.rpc('submit_portal_requisition', { p_id: requisition.id })
  if (rpcErr) {
    // The reserve failed (or a budget block bit): drop the draft so nothing is
    // left half-raised, and tell the requester which item ran out.
    await admin.from('requisitions').delete().eq('id', requisition.id)
    const short = parseStockError(rpcErr.message)
    if (short) {
      return NextResponse.json(
        { error: 'Not enough stock', code: 'stock_short', stock: short },
        { status: 400 }
      )
    }
    console.error('[requisition-portal submit] rpc failed', rpcErr)
    return NextResponse.json({ error: 'Could not send your request for approval.' }, { status: 400 })
  }

  // Best-effort: the request is already in the chain, so a failed notification
  // must not read to the requester as a failed submit.
  try {
    const row = submitted as { status?: string } | null
    if (row?.status === 'pending_approval') {
      await notifyCurrentApprover(admin, {
        id: requisition.id as string,
        requisition_number: requisition.requisition_number as number | null,
        title,
        organisation_id: site.organisation_id,
      })
    }
  } catch (e) {
    console.error('[requisition-portal submit] notify failed', e)
  }

  return NextResponse.json({ ok: true, requisition_number: requisition.requisition_number })
}
