import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type UserWithLogin = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  is_active: boolean | null
  disabled: boolean | null
  last_sign_in_at: string | null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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

  const [org, health, usersRpc, activity] = await Promise.all([
    admin.from('organisations').select('*').eq('id', params.id).single(),
    admin.from('tenant_health').select('*').eq('id', params.id).single(),
    admin.rpc('get_users_with_login', { org_id: params.id }),
    admin.from('audit_logs').select('id, action, created_at, details').eq('organisation_id', params.id).order('created_at', { ascending: false }).limit(5),
  ])

  const users: UserWithLogin[] = (usersRpc.data as UserWithLogin[] | null) ?? []

  return NextResponse.json({
    tenant: {
      ...org.data,
      health: health.data,
      users,
      recent_activity: activity.data ?? [],
    }
  })
}
