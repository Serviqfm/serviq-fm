import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check for active (assigned) work orders — block deletion if any exist
    const { data: linkedWOs } = await supabaseAdmin
      .from('work_orders')
      .select('id, wo_number')
      .eq('assigned_to', userId)
      .eq('status', 'assigned')

    if (linkedWOs && linkedWOs.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete user: ${linkedWOs.length} active work order(s) assigned to this technician. Please reassign or complete these work orders first.`,
          linkedWorkOrders: linkedWOs,
        },
        { status: 400 }
      )
    }

    // Step 1: Delete owned rows that cannot be nulled (user_devices, user_notification_preferences)
    await Promise.all([
      supabaseAdmin.from('user_devices').delete().eq('user_id', userId),
      supabaseAdmin.from('user_notification_preferences').delete().eq('user_id', userId),
    ])

    // Step 2: Null out all FK references in other tables before deleting the profile.
    // This covers every column that points to users.id discovered in the schema.
    await Promise.all([
      // work_orders — two columns reference users.id
      supabaseAdmin.from('work_orders').update({ assigned_to: null }).eq('assigned_to', userId),
      supabaseAdmin.from('work_orders').update({ created_by: null }).eq('created_by', userId),
      // pm_schedules
      supabaseAdmin.from('pm_schedules').update({ assigned_to: null }).eq('assigned_to', userId),
      // audit_logs
      supabaseAdmin.from('audit_logs').update({ user_id: null }).eq('user_id', userId),
      // work_order_comments
      supabaseAdmin.from('work_order_comments').update({ user_id: null }).eq('user_id', userId),
      // invoices
      supabaseAdmin.from('invoices').update({ created_by: null }).eq('created_by', userId),
      // inspection_results
      supabaseAdmin.from('inspection_results').update({ conducted_by: null }).eq('conducted_by', userId),
      // notification_log
      supabaseAdmin.from('notification_log').update({ user_id: null }).eq('user_id', userId),
    ])

    // Step 3: Delete user profile row
    console.log(`[UserDelete] Deleting user profile for ${userId}`)
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId)

    if (profileError) {
      console.error(`[UserDelete] Profile deletion failed: ${JSON.stringify(profileError)}`)
      const errorMsg = profileError.message || JSON.stringify(profileError)
      return NextResponse.json({ error: `Failed to delete user profile: ${errorMsg}` }, { status: 400 })
    }

    // Step 4: Delete auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
