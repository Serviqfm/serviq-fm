// web/src/app/api/assets/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing asset id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[assets PATCH] profile lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const body = (await req.json()) as Record<string, unknown>

  const enforcePayload: Record<string, unknown> = {
    name: body.name,
    category: body.category,
    site_id: body.site_id,
    sub_location: body.sub_location,
    location_notes: body.location_notes,
    manufacturer: body.manufacturer,
    model: body.model,
    serial_number: body.serial_number,
    purchase_date: body.purchase_date,
    purchase_cost: body.purchase_cost,
    warranty_expiry: body.warranty_expiry,
    expected_lifespan_years: body.expected_lifespan_years,
    description: body.description,
  }

  const enforcement = await enforceFieldConfig(profile.organisation_id, 'assets_edit', enforcePayload)
  if ('error' in enforcement) {
    return NextResponse.json({ error: enforcement.error }, { status: 400 })
  }
  const cleaned = enforcement.cleaned

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const costRaw = cleaned.purchase_cost
  const costParsed = typeof costRaw === 'string' && costRaw.trim() !== ''
    ? parseFloat(costRaw)
    : typeof costRaw === 'number'
      ? costRaw
      : null

  const lifespanRaw = cleaned.expected_lifespan_years
  const lifespanParsed = typeof lifespanRaw === 'string' && lifespanRaw.trim() !== ''
    ? parseInt(lifespanRaw)
    : typeof lifespanRaw === 'number'
      ? lifespanRaw
      : null

  const updateRow: Record<string, unknown> = {
    name: cleaned.name ?? null,
    category: cleaned.category ? cleaned.category : null,
    site_id: cleaned.site_id ? cleaned.site_id : null,
    sub_location: cleaned.sub_location ? cleaned.sub_location : null,
    location_notes: cleaned.location_notes ? cleaned.location_notes : null,
    manufacturer: cleaned.manufacturer ? cleaned.manufacturer : null,
    model: cleaned.model ? cleaned.model : null,
    serial_number: cleaned.serial_number ? cleaned.serial_number : null,
    purchase_date: cleaned.purchase_date ? cleaned.purchase_date : null,
    purchase_cost: costParsed,
    warranty_expiry: cleaned.warranty_expiry ? cleaned.warranty_expiry : null,
    expected_lifespan_years: lifespanParsed,
    description: cleaned.description ? cleaned.description : null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await admin
    .from('assets')
    .update(updateRow)
    .eq('id', id)
    .eq('organisation_id', profile.organisation_id)
    .select()
    .single()

  if (error) {
    console.error('[assets PATCH] update failed', error)
    return NextResponse.json({ error: error.message || 'Failed to update asset' }, { status: 500 })
  }
  return NextResponse.json({ asset: data })
}
