// GET ?token=…&session=… — what this address has already asked for.
//
// Scoped by the VERIFIED email on the session, never by anything the caller
// sends: proving you own the mailbox is what entitles you to see its requests.
// Only requests raised through the portal (created_by IS NULL) are listed — a
// staff member who also has an account reads those in the dashboard, where the
// full history and the approval chain live.

import { NextRequest, NextResponse } from 'next/server'
import { adminClient, siteByToken, verifiedSession } from '../_shared'

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
    .from('requisitions')
    .select('id, requisition_number, title, status, created_at, needed_by, site:site_id(name)')
    .eq('organisation_id', site.organisation_id)
    .eq('requester_email', session.email)
    .is('created_by', null)
    .order('created_at', { ascending: false })
    .limit(20)

  // Deliberately thin: no costs, no approver names, no comments. The requester
  // needs to know where their request stands, not who is holding it up.
  const requests = (data ?? []).map(r => ({
    number: r.requisition_number,
    title: r.title,
    status: r.status,
    created_at: r.created_at,
    needed_by: r.needed_by,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    site: (r.site as any)?.name ?? null,
  }))

  return NextResponse.json({ requests })
}
