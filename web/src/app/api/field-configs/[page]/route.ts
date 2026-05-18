// web/src/app/api/field-configs/[page]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { FIELD_CATALOG, FieldPage, FieldVisibility, ALL_PAGES } from '@/lib/field-catalog'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { page: string } }) {
  const page = params.page as FieldPage
  if (!ALL_PAGES.includes(page)) {
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id, role')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[field-configs POST] users lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = (await req.json()) as { overrides?: Record<string, FieldVisibility> }
  const overrides = body.overrides ?? {}

  const catalogForPage = FIELD_CATALOG[page]
  const catalogKeys = new Set(catalogForPage.map(f => f.key))
  for (const [key, vis] of Object.entries(overrides)) {
    if (!catalogKeys.has(key)) {
      return NextResponse.json({ error: `Unknown field "${key}" for page "${page}"` }, { status: 400 })
    }
    if (!['required', 'optional', 'hidden'].includes(vis)) {
      return NextResponse.json({ error: `Invalid visibility "${vis}"` }, { status: 400 })
    }
    const meta = catalogForPage.find(f => f.key === key)
    if (meta?.is_system_required && vis !== 'required') {
      return NextResponse.json({ error: `Field "${key}" is system-required and cannot be changed` }, { status: 400 })
    }
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const rows = Object.entries(overrides).map(([key, vis]) => ({
    organisation_id: profile.organisation_id,
    page,
    field_key: key,
    visibility: vis,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }))

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('field_configs')
      .upsert(rows, { onConflict: 'organisation_id,page,field_key' })
    if (error) {
      console.error('[field-configs POST] upsert failed', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  try {
    const { getFieldConfig } = await import('@/lib/fieldEnforcement')
    const config = await getFieldConfig(profile.organisation_id, page)
    return NextResponse.json({ config: Object.fromEntries(config) })
  } catch (err) {
    console.error('[field-configs POST] getFieldConfig failed', err)
    return NextResponse.json({ error: 'Failed to reload field config' }, { status: 500 })
  }
}
