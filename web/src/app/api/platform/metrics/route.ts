import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type OrgRow = {
  id: string
  name: string | null
  plan: string | null
  billing_status: string | null
  mrr_cents: number | null
  offboarded_at: string | null
  created_at: string
}

type HealthRow = {
  id: string
  name: string | null
  plan: string | null
  billing_status: string | null
  mrr_cents: number | null
  offboarded_at: string | null
  total_score: number
}

type DauMauRow = { dau: number; mau: number }

export async function GET(_req: NextRequest) {
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

  // MRR / ARR / Active tenants / Paying tenants
  const { data: orgsData } = await admin
    .from('organisations')
    .select('id, name, plan, billing_status, mrr_cents, offboarded_at, created_at')
  const orgs: OrgRow[] = (orgsData ?? []) as OrgRow[]
  const active = orgs.filter(o => !o.offboarded_at)
  const paying = active.filter(o => o.billing_status === 'paid')
  const mrrCents = paying.reduce((sum, o) => sum + (o.mrr_cents ?? 0), 0)
  const arrCents = mrrCents * 12

  // Churn 30d: offboarded in last 30d / active 30d ago
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()
  const churnedRecent = orgs.filter(o => o.offboarded_at && o.offboarded_at > thirtyDaysAgo).length
  const active30dAgo = orgs.filter(o =>
    (!o.offboarded_at || o.offboarded_at > thirtyDaysAgo)
    && o.created_at < thirtyDaysAgo
  ).length
  const churnRate = active30dAgo > 0 ? (churnedRecent / active30dAgo) * 100 : 0

  // DAU / MAU via SECURITY DEFINER SQL function
  const { data: dauMau } = await admin.rpc('get_dau_mau').single() as { data: DauMauRow | null }
  const dau = dauMau?.dau ?? 0
  const mau = dauMau?.mau ?? 0

  // Plan distribution
  const planCounts: Record<string, number> = {}
  for (const o of active) {
    const plan = o.plan ?? 'free'
    planCounts[plan] = (planCounts[plan] ?? 0) + 1
  }

  // WO by tenant (top 10, last 30d)
  const { data: woRows } = await admin
    .from('work_orders')
    .select('organisation_id')
    .gte('created_at', thirtyDaysAgo)
  const wosByOrg = new Map<string, number>()
  for (const r of (woRows ?? []) as { organisation_id: string }[]) {
    wosByOrg.set(r.organisation_id, (wosByOrg.get(r.organisation_id) ?? 0) + 1)
  }
  const top10 = Array.from(wosByOrg.entries())
    .map(([orgId, count]) => ({
      orgId,
      orgName: orgs.find(o => o.id === orgId)?.name ?? orgId,
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // MRR snapshots (last 6 months)
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10)
  const { data: snapshots } = await admin
    .from('mrr_snapshots')
    .select('snapshot_date, mrr_cents')
    .gte('snapshot_date', sixMonthsAgo)
    .order('snapshot_date', { ascending: true })

  // Tenants needing attention
  const { data: healthData } = await admin
    .from('tenant_health')
    .select('id, name, plan, billing_status, mrr_cents, offboarded_at, total_score')
  const healthRows: HealthRow[] = (healthData ?? []) as HealthRow[]
  const needsAttention = healthRows
    .filter(t => !t.offboarded_at && (t.total_score < 50 || t.billing_status !== 'paid'))
    .slice(0, 20)

  return NextResponse.json({
    mrrCents,
    arrCents,
    activeTenants: active.length,
    payingTenants: paying.length,
    churnRate30d: Math.round(churnRate * 100) / 100,
    dau,
    mau,
    planCounts,
    top10ByWO: top10,
    mrrSnapshots: snapshots ?? [],
    needsAttention,
  })
}
