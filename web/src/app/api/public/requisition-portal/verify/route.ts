// POST { token, session_id, code } — step 2: check the emailed code.
//
// Attempts are counted in the row, so a burned session cannot be retried by
// reloading the page. A session whose code was never issued (domain not allowed)
// carries code_hash = 'pending' and can never match — same refusal, no oracle.

import { NextRequest, NextResponse } from 'next/server'
import { adminClient, siteByToken } from '../_shared'
import { MAX_ATTEMPTS, hashCode, hashesMatch } from '@/lib/requisitionPortal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REFUSAL = 'That code is not right, or it has expired.'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''

  const admin = adminClient()
  const site = await siteByToken(admin, token)
  if (!site) return NextResponse.json({ error: 'This QR code is not valid.' }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: REFUSAL }, { status: 400 })
  }

  const { data: session } = await admin
    .from('requisition_portal_sessions')
    .select('id, code_hash, attempts, expires_at, verified_at, site_id')
    .eq('id', sessionId)
    .eq('site_id', site.id)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: REFUSAL }, { status: 400 })

  if (
    (session.attempts as number) >= MAX_ATTEMPTS ||
    new Date(session.expires_at as string).getTime() < Date.now()
  ) {
    return NextResponse.json({ error: 'This code has expired. Ask for a new one.' }, { status: 400 })
  }

  if (!hashesMatch(hashCode(code, sessionId), session.code_hash as string)) {
    await admin
      .from('requisition_portal_sessions')
      .update({ attempts: (session.attempts as number) + 1 })
      .eq('id', sessionId)
    return NextResponse.json({ error: REFUSAL }, { status: 400 })
  }

  // Already verified sessions keep their original verified_at, so re-posting the
  // code cannot extend the 30-minute window.
  if (!session.verified_at) {
    await admin
      .from('requisition_portal_sessions')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', sessionId)
  }

  return NextResponse.json({ ok: true, session_id: sessionId })
}
