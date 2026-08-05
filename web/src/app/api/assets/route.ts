// web/src/app/api/assets/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'
import { validateParentAssignment } from './hierarchy'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[assets POST] profile lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const body = (await req.json()) as Record<string, unknown>

  // Non-catalog/system fields handled separately from enforcement.
  const photoUrls = Array.isArray(body.photo_urls) ? (body.photo_urls as string[]) : []
  const parentAssetId = typeof body.parent_asset_id === 'string' && body.parent_asset_id.trim() !== ''
    ? body.parent_asset_id.trim()
    : null
  // AL-21: space assignment (drives the WO Space-Assets commissioning panel).
  const spaceId = typeof body.space_id === 'string' && body.space_id.trim() !== ''
    ? body.space_id.trim()
    : null
  // MKT-14: criticality — constrained to the DB CHECK set; anything else stores null.
  const criticality = typeof body.criticality === 'string' && ['low', 'medium', 'high', 'critical'].includes(body.criticality)
    ? body.criticality
    : null
  // AL-02: org-defined custom field values (assets.custom_fields JSONB).
  const customFields = body.custom_fields && typeof body.custom_fields === 'object' && !Array.isArray(body.custom_fields)
    ? (body.custom_fields as Record<string, unknown>)
    : {}

  // Build payload that matches catalog keys for enforcement.
  const enforcePayload: Record<string, unknown> = {
    name: body.name,
    category: body.category,
    site_id: body.site_id,
    sub_location: body.sub_location,
    serial_number: body.serial_number,
    manufacturer: body.manufacturer,
    model: body.model,
    purchase_date: body.purchase_date,
    purchase_cost: body.purchase_cost,
    warranty_expiry: body.warranty_expiry,
    expected_lifespan_years: body.expected_lifespan_years,
    description: body.description,
    location_notes: body.location_notes,
    photos: photoUrls.length > 0 ? photoUrls : '',
  }

  const enforcement = await enforceFieldConfig(profile.organisation_id, 'assets_new', enforcePayload)
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

  // AL-05: depreciation inputs (salvage_value, useful_life_years). Non-catalog.
  const toNumOrNull = (v: unknown): number | null =>
    typeof v === 'number' ? v
      : typeof v === 'string' && v.trim() !== '' ? Number(v)
      : null
  const salvageValue = toNumOrNull(body.salvage_value)
  const usefulLifeYears = toNumOrNull(body.useful_life_years)

  const qrCode = typeof body.qr_code === 'string' && body.qr_code.trim() !== ''
    ? body.qr_code
    : 'SERVIQ-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11).toUpperCase()

  if (parentAssetId) {
    const check = await validateParentAssignment(admin, profile.organisation_id, parentAssetId, null)
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 })
    }
  }

  // AL-21: the write goes through the service-role client, so validate the space
  // belongs to the caller's organisation (via its site) before storing it.
  if (spaceId) {
    const { data: space } = await admin
      .from('spaces')
      .select('id, site:site_id(organisation_id)')
      .eq('id', spaceId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!space || (space.site as any)?.organisation_id !== profile.organisation_id) {
      return NextResponse.json({ error: 'Space not found in your organisation' }, { status: 400 })
    }
  }

  const insertRow: Record<string, unknown> = {
    organisation_id: profile.organisation_id,
    created_by: user.id,
    name: cleaned.name ?? null,
    category: cleaned.category ? cleaned.category : null,
    site_id: cleaned.site_id ? cleaned.site_id : null,
    sub_location: cleaned.sub_location ? cleaned.sub_location : null,
    serial_number: cleaned.serial_number ? cleaned.serial_number : null,
    manufacturer: cleaned.manufacturer ? cleaned.manufacturer : null,
    model: cleaned.model ? cleaned.model : null,
    purchase_date: cleaned.purchase_date ? cleaned.purchase_date : null,
    purchase_cost: costParsed,
    warranty_expiry: cleaned.warranty_expiry ? cleaned.warranty_expiry : null,
    expected_lifespan_years: lifespanParsed,
    description: cleaned.description ? cleaned.description : null,
    location_notes: cleaned.location_notes ? cleaned.location_notes : null,
    photo_urls: Array.isArray(cleaned.photos) ? cleaned.photos : photoUrls,
    parent_asset_id: parentAssetId,
    space_id: spaceId,
    criticality,
    custom_fields: customFields,
    salvage_value: salvageValue,
    useful_life_years: usefulLifeYears,
    status: 'active',
    qr_code: qrCode,
  }

  const { data, error } = await admin
    .from('assets')
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    console.error('[assets POST] insert failed', error)
    return NextResponse.json({ error: error.message || 'Failed to create asset' }, { status: 500 })
  }
  return NextResponse.json({ asset: data })
}
