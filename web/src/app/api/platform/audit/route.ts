import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type PlatformRow = {
  id: string
  platform_admin_id: string | null
  action: string
  target_organisation_id: string | null
  target_user_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

type TenantRow = {
  id: string
  organisation_id: string | null
  user_id: string | null
  action: string
  entity_type: string | null
  details: Record<string, unknown> | null
  created_at: string
  impersonated_by: string | null
}

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

  const filterAction = req.nextUrl.searchParams.get('action')
  const filterOrg = req.nextUrl.searchParams.get('org_id')
  const includeAllTenant = req.nextUrl.searchParams.get('include_all_tenant') === '1'

  let platformQ = admin.from('platform_audit_logs')
    .select('id, platform_admin_id, action, target_organisation_id, target_user_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (filterAction) platformQ = platformQ.eq('action', filterAction)
  if (filterOrg) platformQ = platformQ.eq('target_organisation_id', filterOrg)

  let tenantQ = admin.from('audit_logs')
    .select('id, organisation_id, user_id, action, entity_type, details, created_at, impersonated_by')
    .order('created_at', { ascending: false })
    .limit(100)
  if (!includeAllTenant) {
    tenantQ = tenantQ.not('impersonated_by', 'is', null)
  }
  if (filterAction) tenantQ = tenantQ.eq('action', filterAction)
  if (filterOrg) tenantQ = tenantQ.eq('organisation_id', filterOrg)

  const [platform, tenant] = await Promise.all([platformQ, tenantQ])
  const platformRows = (platform.data as PlatformRow[] | null) ?? []
  const tenantRows = (tenant.data as TenantRow[] | null) ?? []

  const merged = [
    ...platformRows.map(r => ({
      id: r.id,
      source: 'platform' as const,
      action: r.action,
      org_id: r.target_organisation_id,
      actor: r.platform_admin_id,
      created_at: r.created_at,
      details: r.details,
    })),
    ...tenantRows.map(r => ({
      id: r.id,
      source: (r.impersonated_by ? 'impersonated' : 'tenant') as 'impersonated' | 'tenant',
      action: r.action,
      org_id: r.organisation_id,
      actor: r.impersonated_by ?? r.user_id,
      created_at: r.created_at,
      details: r.details,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50)

  return NextResponse.json({ entries: merged })
}
