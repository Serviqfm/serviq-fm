// web/src/app/api/assets/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'
import { validateParentAssignment } from '../hierarchy'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing asset id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id, role')
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

  // Non-catalog/system field handled separately from enforcement.
  const hasParentField = Object.prototype.hasOwnProperty.call(body, 'parent_asset_id')
  const parentAssetId = typeof body.parent_asset_id === 'string' && body.parent_asset_id.trim() !== ''
    ? body.parent_asset_id.trim()
    : null
  // AL-21: space assignment — only touched when the caller sends the field.
  const hasSpaceField = Object.prototype.hasOwnProperty.call(body, 'space_id')
  const spaceId = typeof body.space_id === 'string' && body.space_id.trim() !== ''
    ? body.space_id.trim()
    : null
  // MKT-14: criticality — only touched when the caller sends the field; constrained
  // to the DB CHECK set, anything else stores null.
  const hasCriticalityField = Object.prototype.hasOwnProperty.call(body, 'criticality')
  const criticality = typeof body.criticality === 'string' && ['low', 'medium', 'high', 'critical'].includes(body.criticality)
    ? body.criticality
    : null
  // AL-02: org-defined custom field values — only touched when the caller sends it.
  const hasCustomFields = Object.prototype.hasOwnProperty.call(body, 'custom_fields')
  const customFields = body.custom_fields && typeof body.custom_fields === 'object' && !Array.isArray(body.custom_fields)
    ? (body.custom_fields as Record<string, unknown>)
    : {}
  // AL-04: custom asset status — only touched when the caller sends it.
  const hasCustomStatusField = Object.prototype.hasOwnProperty.call(body, 'custom_status_id')
  const customStatusId = typeof body.custom_status_id === 'string' && body.custom_status_id.trim() !== ''
    ? body.custom_status_id.trim()
    : null
  // AL-05: depreciation inputs — only touched when the caller sends them.
  const hasSalvage = Object.prototype.hasOwnProperty.call(body, 'salvage_value')
  const hasUsefulLife = Object.prototype.hasOwnProperty.call(body, 'useful_life_years')
  // AL-07: per-asset operating hours/week — only touched when sent; clamped to 0..168.
  const hasOpHours = Object.prototype.hasOwnProperty.call(body, 'operating_hours_per_week')
  // AL-09: editable barcode/QR number — only touched when sent; blank clears it.
  const hasQrCode = Object.prototype.hasOwnProperty.call(body, 'qr_code')
  const toNumOrNull = (v: unknown): number | null =>
    typeof v === 'number' ? v
      : typeof v === 'string' && v.trim() !== '' ? Number(v)
      : null

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

  // AL-12: technicians may only edit assets AT THEIR SITES. Admin/manager are
  // unaffected. Reuses the shipped site-scope infra (t9-01-site-scope): the
  // user_can_access_site RPC runs as the caller (auth'd client) and returns TRUE
  // for unscoped users, NULL-site assets, and the caller's own sites. We check the
  // asset's CURRENT site and, if the edit moves it, the TARGET site too.
  if (profile.role === 'technician') {
    const { data: existing } = await admin
      .from('assets')
      .select('site_id')
      .eq('id', id)
      .eq('organisation_id', profile.organisation_id)
      .maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

    const { data: canCurrent } = await supabase.rpc('user_can_access_site', { p_site_id: existing.site_id })
    if (canCurrent === false) {
      return NextResponse.json({ error: 'You can only edit assets at your assigned sites.' }, { status: 403 })
    }
    const targetSite = cleaned.site_id ? (cleaned.site_id as string) : null
    if (targetSite && targetSite !== existing.site_id) {
      const { data: canTarget } = await supabase.rpc('user_can_access_site', { p_site_id: targetSite })
      if (canTarget === false) {
        return NextResponse.json({ error: 'You can only assign assets to your assigned sites.' }, { status: 403 })
      }
    }
  }

  if (hasParentField && parentAssetId) {
    if (parentAssetId === id) {
      return NextResponse.json({ error: 'An asset cannot be its own parent.' }, { status: 400 })
    }
    const check = await validateParentAssignment(admin, profile.organisation_id, parentAssetId, id)
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 })
    }
  }

  // AL-21: the write goes through the service-role client, so validate the space
  // belongs to the caller's organisation (via its site) before storing it.
  if (hasSpaceField && spaceId) {
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
  if (hasParentField) updateRow.parent_asset_id = parentAssetId
  if (hasSpaceField) updateRow.space_id = spaceId
  if (hasCriticalityField) updateRow.criticality = criticality
  if (hasCustomFields) updateRow.custom_fields = customFields
  if (hasSalvage) updateRow.salvage_value = toNumOrNull(body.salvage_value)
  if (hasUsefulLife) updateRow.useful_life_years = toNumOrNull(body.useful_life_years)
  if (hasOpHours) {
    const oh = toNumOrNull(body.operating_hours_per_week)
    updateRow.operating_hours_per_week = oh == null ? null : Math.min(168, Math.max(0, oh))
  }
  if (hasQrCode) {
    const qr = typeof body.qr_code === 'string' ? body.qr_code.trim() : ''
    updateRow.qr_code = qr !== '' ? qr : null
  }

  // AL-04: setting a custom status also writes the base status it maps to, so lists
  // and reports keep grouping by the base value. Clearing it leaves the base status
  // untouched. The status row is verified to belong to the caller's org.
  if (hasCustomStatusField) {
    updateRow.custom_status_id = customStatusId
    if (customStatusId) {
      const { data: statusRow } = await admin
        .from('asset_statuses')
        .select('maps_to_base_status, organisation_id')
        .eq('id', customStatusId)
        .maybeSingle()
      if (!statusRow || statusRow.organisation_id !== profile.organisation_id) {
        return NextResponse.json({ error: 'Status not found in your organisation' }, { status: 400 })
      }
      updateRow.status = statusRow.maps_to_base_status
    }
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
