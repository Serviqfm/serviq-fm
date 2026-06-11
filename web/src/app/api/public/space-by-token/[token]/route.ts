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

  // Lookup is by qr_token ONLY. (A previous fallback also matched on the space's
  // primary key, which let anyone enumerate spaces by guessing UUIDs — removed.)
  const byToken = await admin
    .from('spaces')
    .select('id, name, floor, qr_token, site:site_id(id, name, organisation_id)')
    .eq('qr_token', token)
    .maybeSingle()

  const space = byToken.data
  if (!space) {
    console.warn('[space-by-token] no match for', token, 'errors:', byToken.error)
    return NextResponse.json({ error: 'Space not found' }, { status: 404 })
  }

  return NextResponse.json({ space })
}
