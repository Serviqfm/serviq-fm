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

    // Check for linked work orders
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

    // Unassign any other associated work orders (completed/closed ones)
    await supabaseAdmin
      .from('work_orders')
      .update({ assigned_to: null })
      .eq('assigned_to', userId)

    // Delete user profile
    const { error: profileError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId)

    if (profileError) {
      // Check if it's a FK constraint error
      if (profileError.message.includes('foreign key') || profileError.message.includes('FK')) {
        return NextResponse.json(
          { error: 'Cannot delete user: user is linked to other records. Please contact support.' },
          { status: 400 }
        )
      }
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    // Delete auth user
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
