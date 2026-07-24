// web/src/app/api/spaces/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing space id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[spaces PATCH] profile lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const body = (await req.json()) as Record<string, unknown>

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const updateRow: Record<string, unknown> = {}

  // AL-20 — re-parent: move the space to a different site in the same org. The
  // target site must belong to the caller's org (org-scoped write).
  if (typeof body.site_id === 'string' && body.site_id) {
    const { data: site } = await admin
      .from('sites').select('id').eq('id', body.site_id).eq('organisation_id', profile.organisation_id).maybeSingle()
    if (!site) return NextResponse.json({ error: 'Target site not found in your organisation' }, { status: 400 })
    updateRow.site_id = body.site_id
  }

  // Full edit-form submits carry `name`; a move-only call (from the location
  // tree) omits it and skips the field-config gate on the content fields.
  if ('name' in body) {
    const enforcement = await enforceFieldConfig(profile.organisation_id, 'spaces_edit', {
      name: body.name,
      name_ar: body.name_ar,
      floor: body.floor,
      description: body.description,
    })
    if ('error' in enforcement) {
      return NextResponse.json({ error: enforcement.error }, { status: 400 })
    }
    const cleaned = enforcement.cleaned
    updateRow.name = cleaned.name ?? null
    updateRow.name_ar = cleaned.name_ar ? cleaned.name_ar : null
    updateRow.floor = cleaned.floor ?? null
    updateRow.description = cleaned.description ? cleaned.description : null
  }

  if (Object.keys(updateRow).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('spaces')
    .update(updateRow)
    .eq('id', id)
    .eq('organisation_id', profile.organisation_id)
    .select()
    .single()

  if (error) {
    console.error('[spaces PATCH] update failed', error)
    return NextResponse.json({ error: error.message || 'Failed to update space' }, { status: 500 })
  }
  return NextResponse.json({ space: data })
}
