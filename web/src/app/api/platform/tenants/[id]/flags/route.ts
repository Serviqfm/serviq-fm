import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

export const runtime = 'nodejs'

const FLAG_FIELDS = ['advanced_reporting', 'api_access', 'invoicing', 'multi_site', 'custom_branding'] as const
type FlagField = (typeof FLAG_FIELDS)[number]

// P0: the workspace split lives on organisations, not tenant_feature_flags, but
// it is edited from the same Feature Flags tab. Read/written separately so a
// pre-migration DB (no such columns) still serves the rest of the flags.
const WORKSPACE_FIELDS = ['has_cafm', 'has_procurement'] as const
type WorkspaceField = (typeof WORKSPACE_FIELDS)[number]
const WORKSPACE_DEFAULTS: Record<WorkspaceField, boolean> = { has_cafm: true, has_procurement: false }

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
    .single() as { data: Record<string, boolean> | null; error: { message: string } | null }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: org } = await auth.admin
    .from('organisations')
    .select(WORKSPACE_FIELDS.join(', '))
    .eq('id', params.id)
    .single() as { data: Record<string, boolean> | null }

  return NextResponse.json({ flags: { ...WORKSPACE_DEFAULTS, ...(org ?? {}), ...(data ?? {}) } })
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

  const workspaceUpdate: Record<string, unknown> = {}
  for (const k of WORKSPACE_FIELDS) {
    if (k in body) workspaceUpdate[k] = body[k]
  }
  if (Object.keys(workspaceUpdate).length > 0) {
    const { data: orgBefore } = await auth.admin
      .from('organisations')
      .select(WORKSPACE_FIELDS.join(', '))
      .eq('id', params.id)
      .single() as { data: Record<string, boolean> | null }

    const { error: orgErr } = await auth.admin
      .from('organisations')
      .update(workspaceUpdate)
      .eq('id', params.id)
    if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 500 })

    for (const k of WORKSPACE_FIELDS) {
      if (k in body && orgBefore?.[k] !== body[k]) {
        await logPlatformAction({
          platform_admin_id: auth.user.id,
          action: 'flag.toggle',
          target_organisation_id: params.id,
          details: { flag: k, from: orgBefore?.[k] ?? null, to: body[k] },
        })
      }
    }
  }

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
