import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, full_name, full_name_ar, role, phone, organisation_id } = body

    if (!email || !full_name || !role || !organisation_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

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

    // Create auth user with a temporary password
    const tempPassword = 'Serviq' + Math.random().toString(36).slice(2, 10) + '!1'
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

    return NextResponse.json({
      success: true,
      userId: authData.user.id,
      tempPassword,
    })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
