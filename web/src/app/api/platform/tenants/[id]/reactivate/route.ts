import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
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

  await admin.from('organisations').update({
    offboarded_at: null, offboarded_by: null,
  }).eq('id', params.id)

  // Note: we do NOT touch is_active. Only restore `disabled = false` for users disabled by offboarding.
  await admin.from('users').update({ disabled: false }).eq('organisation_id', params.id)

  const { data: org } = await admin.from('organisations').select('name').eq('id', params.id).single()
  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'tenant.reactivate',
    target_organisation_id: params.id,
    details: { org_id: params.id, org_name: org?.name },
  })
  return NextResponse.json({ success: true })
}
