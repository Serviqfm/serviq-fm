// web/src/app/api/erp/vendor-created/route.ts
// POST { vendor_id } — tell the ERP framework a vendor was created.
//
// Vendor creation happens client-side (dashboard/vendors/new inserts through
// PostgREST), so there is no server route to hang the hook on. The page pings
// this endpoint after its insert succeeds, without waiting on the answer.
//
// Safe against forged calls: the vendor is looked up inside the CALLER'S org, so
// the worst a crafted request can do is log a sync row about a vendor that
// organisation already owns.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'
import { fireErpEvent } from '@/lib/erp'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const caller = await resolveCaller(['admin', 'manager'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const body = (await req.json().catch(() => ({}))) as { vendor_id?: unknown }
  const vendorId = typeof body.vendor_id === 'string' ? body.vendor_id : ''
  if (!vendorId) return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })

  const { data: vendor } = await admin
    .from('vendors')
    .select('id, company_name, vat_number, cr_number, email')
    .eq('id', vendorId)
    .eq('organisation_id', orgId)
    .maybeSingle()
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })

  // Awaited here (unlike the other hooks): nobody is waiting on this response —
  // the page fired it and moved on — so the row can be written reliably.
  await fireErpEvent(orgId, 'vendor.created', vendor.id, {
    company_name: vendor.company_name,
    vat_number: vendor.vat_number,
    cr_number: vendor.cr_number,
    email: vendor.email,
  })

  return NextResponse.json({ ok: true }, { status: 202 })
}
