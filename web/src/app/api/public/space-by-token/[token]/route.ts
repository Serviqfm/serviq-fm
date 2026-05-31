import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// Public lookup: takes a space qr_token and returns the space + parent site identity.
// Bypasses RLS via service role since anon users do not belong to any org and cannot
// read the spaces table directly.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = params.token
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // First try qr_token (the proper field). Fall back to id in case a QR was generated
  // before qr_token existed on the spaces row, or a tester scanned a space id by hand.
  const byToken = await admin
    .from('spaces')
    .select('id, name, floor, qr_token, site:site_id(id, name, organisation_id)')
    .eq('qr_token', token)
    .maybeSingle()

  let space = byToken.data
  if (!space) {
    const byId = await admin
      .from('spaces')
      .select('id, name, floor, qr_token, site:site_id(id, name, organisation_id)')
      .eq('id', token)
      .maybeSingle()
    space = byId.data
  }

  if (!space) {
    console.warn('[space-by-token] no match for', token, 'errors:', byToken.error)
    return NextResponse.json({ error: 'Space not found', detail: byToken.error?.message }, { status: 404 })
  }

  return NextResponse.json({ space })
}
