import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type AuditEntry = {
  id: string
  action: string
  created_at: string
  details: Record<string, unknown> | null
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

  const [platform, tenant] = await Promise.all([
    admin.from('platform_audit_logs').select('id, action, created_at, details').eq('target_organisation_id', params.id).order('created_at', { ascending: false }).limit(50),
    admin.from('audit_logs').select('id, action, created_at, details').eq('organisation_id', params.id).order('created_at', { ascending: false }).limit(50),
  ])
  const platformRows = (platform.data as AuditEntry[] | null) ?? []
  const tenantRows = (tenant.data as AuditEntry[] | null) ?? []
  const merged = [
    ...platformRows.map(r => ({ ...r, source: 'platform' as const })),
    ...tenantRows.map(r => ({ ...r, source: 'tenant' as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50)
  return NextResponse.json({ entries: merged })
}
