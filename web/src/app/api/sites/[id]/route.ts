// web/src/app/api/sites/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing site id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[sites PATCH] profile lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const body = (await req.json()) as Record<string, unknown>

  const enforcePayload: Record<string, unknown> = {
    name: body.name,
    name_ar: body.name_ar,
    city: body.city,
    address: body.address,
    invoicing_enabled: body.invoicing_enabled,
  }

  const enforcement = await enforceFieldConfig(profile.organisation_id, 'sites_edit', enforcePayload)
  if ('error' in enforcement) {
    return NextResponse.json({ error: enforcement.error }, { status: 400 })
  }
  const cleaned = enforcement.cleaned

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const updateRow: Record<string, unknown> = {
    name: cleaned.name ?? null,
    name_ar: cleaned.name_ar ? cleaned.name_ar : null,
    city: cleaned.city ? cleaned.city : null,
    address: cleaned.address ? cleaned.address : null,
    updated_at: new Date().toISOString(),
  }

  // invoicing_enabled is a boolean — only include if it was in the cleaned payload
  if ('invoicing_enabled' in cleaned) {
    updateRow.invoicing_enabled = Boolean(cleaned.invoicing_enabled)
  }

  const { data, error } = await admin
    .from('sites')
    .update(updateRow)
    .eq('id', id)
    .eq('organisation_id', profile.organisation_id)
    .select()
    .single()

  if (error) {
    console.error('[sites PATCH] update failed', error)
    return NextResponse.json({ error: error.message || 'Failed to update site' }, { status: 500 })
  }
  return NextResponse.json({ site: data })
}
