import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email, full_name, full_name_ar, role, phone, organisation_id } = await req.json()

    if (!email || !full_name || !role || !organisation_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Use service role key to create auth user
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Create auth user with a temporary password
    const tempPassword = 'Serviq' + Math.random().toString(36).slice(2, 10) + '!1'
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Create user profile record
    const { error: profileError } = await supabaseAdmin.from('users').insert({
      id: authData.user.id,
      email,
      full_name,
      full_name_ar: full_name_ar || null,
      role,
      phone: phone || null,
      organisation_id,
      is_active: true,
      invited_at: new Date().toISOString(),
    })

    if (profileError) {
      // Rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true, 
      userId: authData.user.id,
      tempPassword,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}