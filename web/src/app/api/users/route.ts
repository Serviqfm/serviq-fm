import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'
import { generateTempPassword } from '@/lib/tempPassword'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
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

    const body = await req.json()
    const { email, full_name, full_name_ar, role, phone } = body

    if (!email || !full_name || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Only admins may create admin users.
    if (role === 'admin' && callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create admin users' }, { status: 403 })
    }

    // SECURITY: organisation_id always comes from the caller's profile — never
    // from the request body (prevents cross-org user creation).
    const organisation_id = callerProfile.organisation_id

    // Server-side field config enforcement (defense-in-depth)
    const enforcement = await enforceFieldConfig(organisation_id, 'users_new', {
      email,
      full_name,
      full_name_ar,
      role,
      phone,
    })
    if ('error' in enforcement) {
      return NextResponse.json({ error: enforcement.error }, { status: 400 })
    }
    const cleaned = enforcement.cleaned as {
      email?: string
      full_name?: string
      full_name_ar?: string
      role?: string
      phone?: string
    }

    // Use service role key to create auth user (deferred to runtime)
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // email and role are is_system_required: true — guaranteed present
    const cleanedEmail = cleaned.email as string
    const cleanedFullName = cleaned.full_name as string
    const cleanedRole = cleaned.role as string

    // Re-check on the cleaned value too (it's what actually gets inserted).
    if (cleanedRole === 'admin' && callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create admin users' }, { status: 403 })
    }

    // Create auth user with a CSPRNG temporary password (DV-09)
    const tempPassword = generateTempPassword()
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanedEmail,
      password: tempPassword,
      email_confirm: true,
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Create user profile record
    const { error: profileError } = await supabaseAdmin.from('users').insert({
      id: authData.user.id,
      email: cleanedEmail,
      full_name: cleanedFullName,
      full_name_ar: cleaned.full_name_ar || null,
      role: cleanedRole,
      phone: cleaned.phone || null,
      organisation_id,
      is_active: true,
      invited_at: new Date().toISOString(),
      must_change_password: true,
    })

    if (profileError) {
      // Rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    // Send welcome email (deferred to runtime)
    try {
      const { notifyWelcomeEmail } = await import('@/lib/notifications/workOrderNotifications')
      await notifyWelcomeEmail(
        authData.user.id,
        cleanedEmail,
        cleanedFullName,
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/login/employee`,
        tempPassword
      );
    } catch (err) {
      console.error('Failed to send welcome email:', err)
      // Don't fail the user creation if email fails
    }

    // DV-09: do NOT echo the temp password in the response — it is delivered by
    // the welcome email, and the user is forced to change it on first login.
    return NextResponse.json({
      success: true,
      userId: authData.user.id,
    })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
