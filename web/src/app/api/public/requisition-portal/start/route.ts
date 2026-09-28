// POST { token, email } — step 1 of the QR portal: email a one-time code.
//
// The response is deliberately the SAME whether or not the address is allowed:
// telling an anonymous caller "that domain is not on the list" would turn the
// portal into an oracle for guessing a tenant's mail domains. The code is only
// actually sent when the domain checks out.

import { NextRequest, NextResponse } from 'next/server'
import { adminClient, siteByToken } from '../_shared'
import { sendEmail } from '@/lib/email'
import {
  CODE_TTL_MIN, MAX_CODES_PER_HOUR, emailDomainAllowed, generateCode, hashCode,
} from '@/lib/requisitionPortal'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  const admin = adminClient()
  const site = await siteByToken(admin, token)
  if (!site) return NextResponse.json({ error: 'This QR code is not valid.' }, { status: 404 })
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  // One row per attempt, so the hourly cap counts attempts whether or not the
  // address was allowed — the cap cannot be sidestepped by varying the domain.
  const { count } = await admin
    .from('requisition_portal_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
  if ((count ?? 0) >= MAX_CODES_PER_HOUR) {
    return NextResponse.json(
      { error: 'Too many codes requested. Try again in an hour.' },
      { status: 429 }
    )
  }

  const expires = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString()
  const { data: session, error } = await admin
    .from('requisition_portal_sessions')
    .insert({
      organisation_id: site.organisation_id,
      site_id: site.id,
      email,
      code_hash: 'pending',
      expires_at: expires,
    })
    .select('id')
    .single()
  if (error || !session) {
    console.error('[requisition-portal start] session insert failed', error)
    return NextResponse.json({ error: 'Could not start the request.' }, { status: 500 })
  }

  if (emailDomainAllowed(email, site.domains)) {
    const code = generateCode()
    await admin
      .from('requisition_portal_sessions')
      .update({ code_hash: hashCode(code, session.id as string) })
      .eq('id', session.id)

    const org = site.orgName ?? 'ServIQ-FM'
    await sendEmail(
      email,
      `${code} — your ${org} request code`,
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your verification code</h2>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px;">${code}</p>
        <p>Use it to raise a request for <strong>${site.name ?? 'your site'}</strong>. It expires in ${CODE_TTL_MIN} minutes.</p>
        <p style="color:#666;font-size:13px;">If you did not ask for this code, ignore this email — nothing was submitted.</p>
      </div>`
    )
  }

  // Same shape either way.
  return NextResponse.json({ session_id: session.id, site: { name: site.name }, expires_in_min: CODE_TTL_MIN })
}
