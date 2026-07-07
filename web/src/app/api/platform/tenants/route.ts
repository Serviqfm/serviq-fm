import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { generateTempPassword } from '@/lib/tempPassword'

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

export async function POST(req: NextRequest) {
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

  const body = await req.json() as { org_name?: string; plan?: string; admin_email?: string; admin_full_name?: string }
  if (!body.org_name || !body.plan || !body.admin_email || !body.admin_full_name) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!['free', 'starter', 'pro', 'enterprise'].includes(body.plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  // 1. Org
  const { data: org, error: orgErr } = await admin.from('organisations').insert({
    name: body.org_name,
    plan: body.plan,
    mrr_cents: 0,
    billing_status: 'paid',
  }).select().single()
  if (orgErr || !org) return NextResponse.json({ error: orgErr?.message ?? 'Org insert failed' }, { status: 500 })

  // 2. Feature flag row
  await admin.from('tenant_feature_flags').insert({ organisation_id: org.id })

  // 3. Auth user with a CSPRNG temp password (DV-09)
  const tempPassword = generateTempPassword()
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: body.admin_email, password: tempPassword, email_confirm: true,
  })
  if (authErr || !authUser.user) {
    await admin.from('organisations').delete().eq('id', org.id)
    return NextResponse.json({ error: authErr?.message ?? 'Auth user create failed' }, { status: 500 })
  }

  // 4. User profile
  const { error: profErr } = await admin.from('users').insert({
    id: authUser.user.id,
    email: body.admin_email,
    full_name: body.admin_full_name,
    role: 'admin',
    organisation_id: org.id,
    is_active: true,
    disabled: false,
    invited_at: new Date().toISOString(),
    must_change_password: true,
  })
  if (profErr) {
    await admin.auth.admin.deleteUser(authUser.user.id)
    await admin.from('organisations').delete().eq('id', org.id)
    return NextResponse.json({ error: profErr.message }, { status: 500 })
  }

  // 5. (Sprint E coordination) Seed field_configs if helper available
  try {
    const { seedFieldConfigsForOrg } = await import('@/lib/fieldEnforcement')
    await seedFieldConfigsForOrg(org.id)
  } catch {
    // Sprint E may not have shipped — safe to skip
  }

  // 6. Welcome email
  try {
    const { notifyWelcomeEmail } = await import('@/lib/notifications/workOrderNotifications')
    await notifyWelcomeEmail(
      authUser.user.id,
      body.admin_email,
      body.admin_full_name,
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/login/client`,
      tempPassword,
    )
  } catch (e) {
    console.error('Welcome email failed:', e)
  }

  // 7. Audit
  const { logPlatformAction } = await import('@/lib/platformAudit')
  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'tenant.create',
    target_organisation_id: org.id,
    details: { org_id: org.id, org_name: body.org_name, plan: body.plan, first_admin_email: body.admin_email },
  })

  // Return the temp password so the platform admin sees it once on screen, in
  // case Resend hasn't delivered the welcome email (or hasn't been configured).
  return NextResponse.json({
    org_id: org.id,
    admin_email: body.admin_email,
    temp_password: tempPassword,
  })
}
