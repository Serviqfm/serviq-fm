// GET ?token=…&session=… — the stock the portal may offer.
//
// Only items at the QR's own site, and only the columns the picker draws with:
// no costs, no minimum levels, nothing a requester outside the organisation has
// any business seeing.

import { NextRequest, NextResponse } from 'next/server'
import { adminClient, siteByToken, verifiedSession } from '../_shared'
import { availableStock } from '@/lib/stock'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''
  const sessionId = url.searchParams.get('session') ?? ''

  const admin = adminClient()
  const site = await siteByToken(admin, token)
  if (!site) return NextResponse.json({ error: 'This QR code is not valid.' }, { status: 404 })

  const session = await verifiedSession(admin, sessionId, site.id)
  if (!session) return NextResponse.json({ error: 'Your session expired.' }, { status: 401 })

  const { data } = await admin
    .from('inventory_items')
    .select('id, name, name_ar, sku, unit, photo_url, stock_quantity, reserved_quantity')
    .eq('organisation_id', site.organisation_id)
    .eq('site_id', site.id)
    .order('name')

  const items = (data ?? []).map(i => ({
    id: i.id,
    name: i.name,
    name_ar: i.name_ar,
    sku: i.sku,
    unit: i.unit,
    photo_url: i.photo_url,
    available: availableStock(i),
  }))

  return NextResponse.json({ items })
}
