import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
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

  const search = req.nextUrl.searchParams.get('q') ?? ''
  const planFilter = req.nextUrl.searchParams.getAll('plan')
  const billingFilter = req.nextUrl.searchParams.getAll('billing')
  const includeOffboarded = req.nextUrl.searchParams.get('include_offboarded') === '1'

  let q = admin.from('tenant_health').select('*')
  if (search) q = q.ilike('name', `%${search}%`)
  if (planFilter.length > 0) q = q.in('plan', planFilter)
  if (billingFilter.length > 0) q = q.in('billing_status', billingFilter)
  if (!includeOffboarded) q = q.is('offboarded_at', null)
  const { data } = await q.order('name')

  return NextResponse.json({ tenants: data ?? [] })
}
