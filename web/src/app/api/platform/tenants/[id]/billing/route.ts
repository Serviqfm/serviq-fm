import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

export const runtime = 'nodejs'

const FIELDS = ['plan', 'billing_status', 'mrr_cents', 'renews_at', 'contract_notes', 'stripe_customer_id', 'stripe_subscription_id'] as const
type Field = (typeof FIELDS)[number]

type AuthOk = { user: { id: string }; admin: SupabaseClient }
type AuthErr = { error: NextResponse }

async function checkPlatformAdmin(): Promise<AuthOk | AuthErr> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user, admin }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await checkPlatformAdmin()
  if ('error' in auth) return auth.error

  const { data, error } = await auth.admin
    .from('organisations')
    .select(FIELDS.join(', '))
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ billing: data })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await checkPlatformAdmin()
  if ('error' in auth) return auth.error

  const incoming = (await req.json()) as Record<string, unknown>

  const { data: before } = await auth.admin
    .from('organisations')
    .select(FIELDS.join(', '))
    .eq('id', params.id)
    .single() as { data: Record<string, unknown> | null }

  const update: Record<string, unknown> = {}
  for (const k of FIELDS) {
    if (k in incoming) update[k] = incoming[k]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: true, noop: true })
  }

  const { error } = await auth.admin
    .from('organisations')
    .update(update)
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Build diff for audit log
  const diff: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of FIELDS as readonly Field[]) {
    if (k in update && before?.[k] !== update[k]) {
      diff[k] = { from: before?.[k] ?? null, to: update[k] }
    }
  }

  await logPlatformAction({
    platform_admin_id: auth.user.id,
    action: 'tenant.plan_change',
    target_organisation_id: params.id,
    details: { org_id: params.id, diff },
  })

  return NextResponse.json({ success: true })
}
