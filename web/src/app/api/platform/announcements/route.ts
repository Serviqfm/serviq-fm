import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

export const runtime = 'nodejs'

type AuthOk = { user: { id: string }; admin: SupabaseClient }
type AuthErr = { error: NextResponse }

async function gatePlatformAdmin(): Promise<AuthOk | AuthErr> {
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

export async function GET() {
  const gate = await gatePlatformAdmin()
  if ('error' in gate) return gate.error
  const { data } = await gate.admin
    .from('tenant_announcements')
    .select('id, title, body, organisation_id, published_at, active, created_at')
    .order('created_at', { ascending: false })
  return NextResponse.json({ announcements: data ?? [] })
}

export async function POST(req: NextRequest) {
  const gate = await gatePlatformAdmin()
  if ('error' in gate) return gate.error
  const { admin, user } = gate

  const body = await req.json() as {
    title?: string
    body?: string
    organisation_id?: string | null // null/omitted = all tenants
    publish?: boolean
  }
  const title = String(body.title ?? '').trim()
  const text = String(body.body ?? '').trim()
  if (!title || !text) {
    return NextResponse.json({ error: 'Title and body are required' }, { status: 400 })
  }

  const { data: inserted, error } = await admin.from('tenant_announcements').insert({
    title,
    body: text,
    organisation_id: body.organisation_id || null,
    published_at: body.publish ? new Date().toISOString() : null,
    created_by: user.id,
  }).select().single()
  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'announcement.publish',
    target_organisation_id: body.organisation_id || null,
    details: { announcement_id: inserted.id, published: !!body.publish },
  })

  return NextResponse.json({ announcement: inserted })
}
