import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type EmailStatusRow = { status: string }
type RecentErrorRow = {
  id: string
  status: string
  error_message: string | null
  created_at: string
  type_key: string
}

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

  // 1. Supabase latency
  const t0 = Date.now()
  let supabaseStatus: 'ok' | 'error' = 'ok'
  try {
    const { error } = await admin.from('organisations').select('id', { head: true, count: 'exact' }).limit(1)
    if (error) supabaseStatus = 'error'
  } catch {
    supabaseStatus = 'error'
  }
  const supabaseLatencyMs = Date.now() - t0

  // 2. Vercel status (public endpoint)
  let vercelIndicator: string = 'unknown'
  try {
    const r = await fetch('https://www.vercel-status.com/api/v2/status.json', { cache: 'no-store' })
    if (r.ok) {
      const j = (await r.json()) as { status: { indicator: string; description: string } }
      vercelIndicator = j.status.indicator
    }
  } catch {
    /* keep unknown */
  }

  // 3. Email log summary (last 24h)
  const since = new Date(Date.now() - 86400_000).toISOString()
  const { data: emails } = await admin
    .from('notification_log')
    .select('status')
    .gte('created_at', since)
  const emailCounts: Record<string, number> = {}
  for (const e of ((emails as EmailStatusRow[] | null) ?? [])) {
    emailCounts[e.status] = (emailCounts[e.status] ?? 0) + 1
  }

  // 4. Recent errors
  const { data: recentErrors } = await admin
    .from('notification_log')
    .select('id, status, error_message, created_at, type_key')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    supabase: { status: supabaseStatus, latency_ms: supabaseLatencyMs },
    vercel: { indicator: vercelIndicator },
    email_24h: emailCounts,
    recent_errors: ((recentErrors as RecentErrorRow[] | null) ?? []),
  })
}
