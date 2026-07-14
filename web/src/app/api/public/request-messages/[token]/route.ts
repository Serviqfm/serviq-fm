import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public message thread for the requester on /track/[token]. The tracking token
// scopes every read/write to exactly one request — the anon requester never
// touches request_messages directly (no anon RLS policy), only through here via
// the service role. There is no way to reach another request: the token resolves
// to a single request_id and all queries are pinned to it.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function resolveRequest(token: string) {
  if (!token) return null
  const { data } = await admin()
    .from('requests')
    .select('id, organisation_id, requester_name')
    .eq('tracking_token', token)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const request = await resolveRequest(params.token)
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: messages } = await admin()
    .from('request_messages')
    .select('id, sender_type, sender_name, body, created_at')
    .eq('request_id', request.id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ messages: messages ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const request = await resolveRequest(params.token)
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { body } = await req.json().catch(() => ({ body: '' }))
  const text = typeof body === 'string' ? body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: 'Message too long' }, { status: 400 })

  // Lightweight anti-flood: a tracking token is low-secrecy (emailed in plaintext),
  // so throttle a requester to one message per few seconds per request.
  const { data: recent } = await admin()
    .from('request_messages')
    .select('created_at')
    .eq('request_id', request.id)
    .eq('sender_type', 'requester')
    .order('created_at', { ascending: false })
    .limit(1)
  if (recent?.[0] && Date.now() - new Date(recent[0].created_at as string).getTime() < 3000) {
    return NextResponse.json({ error: 'Please wait a moment before sending again' }, { status: 429 })
  }

  // sender_type is forced to 'requester' and org/request are taken from the
  // token-resolved row — the client cannot spoof either.
  const { data, error } = await admin()
    .from('request_messages')
    .insert({
      organisation_id: request.organisation_id,
      request_id: request.id,
      sender_type: 'requester',
      sender_name: request.requester_name ?? null,
      body: text,
    })
    .select('id, sender_type, sender_name, body, created_at')
    .single()

  if (error) return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  return NextResponse.json({ message: data })
}
