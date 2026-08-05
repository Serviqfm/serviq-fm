import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// PDPL deletion-request queue for org admins. Reads live in account_deletion_requests
// (RLS deny-all — see w6-6-pdpl.sql), so both list + process go through the
// service-role client, always re-scoped to the caller's own organisation.

async function adminContext() {
  const server = await createServerSupabaseClient()
  const { data: { user: caller } } = await server.auth.getUser()
  if (!caller) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await server
    .from('users').select('organisation_id, role').eq('id', caller.id).single()
  if (!profile?.organisation_id) return { error: NextResponse.json({ error: 'No organisation' }, { status: 403 }) }
  if (profile.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 }) }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 }) }
  }
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  return { caller, orgId: profile.organisation_id as string, admin }
}

// List pending (unprocessed) deletion requests for the caller's org.
export async function GET() {
  const ctx = await adminContext()
  if ('error' in ctx) return ctx.error
  const { orgId, admin } = ctx

  const { data, error } = await admin
    .from('account_deletion_requests')
    .select('id, user_id, email, requested_at, processed_at')
    .eq('organisation_id', orgId)
    .is('processed_at', null)
    .order('requested_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ requests: data ?? [] })
}

// Process a request = erase the user's PII (keep audit rows, null personal
// fields) and stamp the request processed. disabled=true already blocks login
// everywhere (middleware + web login gate).
export async function POST(req: NextRequest) {
  const ctx = await adminContext()
  if ('error' in ctx) return ctx.error
  const { caller, orgId, admin } = ctx

  const { requestId } = await req.json()
  if (!requestId) return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })

  const { data: dr } = await admin
    .from('account_deletion_requests')
    .select('id, user_id, organisation_id, processed_at')
    .eq('id', requestId)
    .maybeSingle()
  if (!dr || dr.organisation_id !== orgId) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (dr.processed_at) return NextResponse.json({ error: 'Already processed' }, { status: 400 })

  // Anonymise PII on the central users row — because names render everywhere via
  // a join to this row, scrubbing it here scrubs comments/time-logs/WOs too.
  if (dr.user_id) {
    const anonEmail = `deleted-${dr.user_id.slice(0, 8)}@deleted.invalid`
    const { error: uErr } = await admin.from('users').update({
      full_name: '[erased]', full_name_ar: null, phone: null,
      job_title: null, email: anonEmail, disabled: true,
    }).eq('id', dr.user_id)
    if (uErr) return NextResponse.json({ error: `Failed to erase profile: ${uErr.message}` }, { status: 400 })

    // Best-effort: scrub the auth-side email too so no PII lingers in auth.users.
    // Non-fatal — the disabled flag already blocks sign-in.
    try { await admin.auth.admin.updateUserById(dr.user_id, { email: anonEmail }) } catch {}
  }

  const { error: pErr } = await admin
    .from('account_deletion_requests')
    .update({ processed_at: new Date().toISOString(), processed_by: caller.id })
    .eq('id', requestId)
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 })

  return NextResponse.json({ success: true })
}
