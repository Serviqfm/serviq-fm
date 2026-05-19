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

  const enforcePayload: Record<string, unknown> = {
    name: body.name,
    name_ar: body.name_ar,
    floor: body.floor,
    description: body.description,
  }

  const enforcement = await enforceFieldConfig(profile.organisation_id, 'spaces_edit', enforcePayload)
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
    floor: cleaned.floor ?? null,
    description: cleaned.description ? cleaned.description : null,
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
