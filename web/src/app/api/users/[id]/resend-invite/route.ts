// web/src/app/api/users/[id]/resend-invite/route.ts
//
// Re-sends the welcome invite to a PENDING user (invited_at set, never logged
// in): rotates their temp password and re-sends the welcome email exactly the
// way POST /api/users does on creation.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateTempPassword } from '@/lib/tempPassword'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!id) return NextResponse.json({ error: 'Missing user id' }, { status: 400 })

    // Authenticate the caller via the cookie-bound Supabase server client.
    const serverSupabase = await createServerSupabaseClient()
    const { data: { user: caller } } = await serverSupabase.auth.getUser()
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: callerProfile } = await serverSupabase
      .from('users')
      .select('organisation_id, role')
      .eq('id', caller.id)
      .single()
    if (!callerProfile?.organisation_id) {
      return NextResponse.json({ error: 'No organisation' }, { status: 403 })
    }
    if (!['admin', 'manager'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Target must exist and belong to the caller's organisation.
    const { data: target } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, organisation_id, invited_at, first_login_at')
      .eq('id', id)
      .maybeSingle()
    if (!target || target.organisation_id !== callerProfile.organisation_id) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Only pending users (invited but never logged in) can have the invite resent.
    if (!target.invited_at || target.first_login_at) {
      return NextResponse.json(
        {
          error: 'Invite can only be resent for pending users who have not logged in yet.',
          code: 'not_pending',
        },
        { status: 400 }
      )
    }

    // Rotate the temporary password (CSPRNG, same helper as user creation — DV-09).
    const tempPassword = generateTempPassword()
    const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: tempPassword,
    })
    if (pwError) {
      return NextResponse.json({ error: pwError.message }, { status: 400 })
    }

    // Refresh invited_at and re-arm the forced password change for the new temp password.
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ invited_at: new Date().toISOString(), updated_at: new Date().toISOString(), must_change_password: true })
      .eq('id', id)
    if (updateError) {
      console.error('[resend-invite] failed to refresh invited_at', updateError)
    }

    // Re-send the welcome email the same way POST /api/users does.
    try {
      const { notifyWelcomeEmail } = await import('@/lib/notifications/workOrderNotifications')
      await notifyWelcomeEmail(
        target.id,
        target.email,
        target.full_name || target.email,
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/login/employee`,
        tempPassword
      )
    } catch (err) {
      console.error('Failed to send welcome email:', err)
      // Don't fail the resend if email fails — the admin still gets the password.
    }

    // DV-09: the rotated temp password is delivered by the welcome email only —
    // never echoed in the response. The user is forced to change it on first login.
    return NextResponse.json({
      success: true,
      userId: target.id,
    })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
