import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Set the current user's password (DV-08 / DV-09). Used by three callers, all with
// a valid session (recovery, forced-change, or normal):
//   - /reset-password  (recovery session from the emailed link)
//   - /change-password (forced change after a temp-password first login)
//   - dashboard settings Account tab (voluntary change)
// It also clears the must_change_password flag so the forced-change gate lets the
// user back into the dashboard.
export async function POST(req: NextRequest) {
  const serverSupabase = await createServerSupabaseClient()
  const { data: { user } } = await serverSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { password } = await req.json().catch(() => ({ password: undefined }))
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error: pwErr } = await admin.auth.admin.updateUserById(user.id, { password })
  if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 400 })

  // Best-effort: clear the forced-change flag. Ignored if the column isn't present
  // yet (batch-2 SQL not run) — the password change itself has already succeeded.
  await admin.from('users').update({ must_change_password: false }).eq('id', user.id)

  return NextResponse.json({ success: true })
}
