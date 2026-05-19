import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type OrgRow = {
  id: string
  billing_status: string | null
  mrr_cents: number | null
  offboarded_at: string | null
}

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: orgsData } = await admin
    .from('organisations')
    .select('id, billing_status, mrr_cents, offboarded_at')
  const orgs: OrgRow[] = (orgsData ?? []) as OrgRow[]
  const active = orgs.filter(o => !o.offboarded_at)
  const paying = active.filter(o => o.billing_status === 'paid')
  const mrr = paying.reduce((s, o) => s + (o.mrr_cents ?? 0), 0)
  const arr = mrr * 12
  const today = new Date().toISOString().slice(0, 10)

  await admin.from('mrr_snapshots').upsert(
    {
      snapshot_date: today,
      mrr_cents: mrr,
      arr_cents: arr,
      active_tenants: active.length,
      paying_tenants: paying.length,
    },
    { onConflict: 'snapshot_date' }
  )

  return NextResponse.json({
    success: true,
    snapshot_date: today,
    mrr_cents: mrr,
    arr_cents: arr,
  })
}
