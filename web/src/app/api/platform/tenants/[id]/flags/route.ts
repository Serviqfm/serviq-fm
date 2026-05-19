import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

export const runtime = 'nodejs'

const FLAG_FIELDS = ['advanced_reporting', 'api_access', 'invoicing', 'multi_site', 'custom_branding'] as const
type FlagField = (typeof FLAG_FIELDS)[number]

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
    .from('tenant_feature_flags')
    .select(FLAG_FIELDS.join(', '))
    .eq('organisation_id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ flags: data })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await checkPlatformAdmin()
  if ('error' in auth) return auth.error

  const body = (await req.json()) as Record<string, boolean>

  const { data: before } = await auth.admin
    .from('tenant_feature_flags')
    .select(FLAG_FIELDS.join(', '))
    .eq('organisation_id', params.id)
    .single() as { data: Record<string, boolean> | null }

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: auth.user.id,
  }
  for (const k of FLAG_FIELDS) {
    if (k in body) update[k] = body[k]
  }

  const { error } = await auth.admin
    .from('tenant_feature_flags')
    .update(update)
    .eq('organisation_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const k of FLAG_FIELDS as readonly FlagField[]) {
    if (k in body && before?.[k] !== body[k]) {
      await logPlatformAction({
        platform_admin_id: auth.user.id,
        action: 'flag.toggle',
        target_organisation_id: params.id,
        details: { flag: k, from: before?.[k] ?? null, to: body[k] },
      })
    }
  }

  return NextResponse.json({ success: true })
}
