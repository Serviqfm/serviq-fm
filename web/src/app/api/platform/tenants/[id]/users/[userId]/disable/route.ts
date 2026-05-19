import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: { id: string; userId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { disabled } = (await req.json()) as { disabled: boolean }
  const { error } = await admin
    .from('users')
    .update({ disabled })
    .eq('id', params.userId)
    .eq('organisation_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logPlatformAction({
    platform_admin_id: user.id,
    action: disabled ? 'user.disable' : 'user.enable',
    target_organisation_id: params.id,
    target_user_id: params.userId,
    details: {},
  })
  return NextResponse.json({ success: true })
}
