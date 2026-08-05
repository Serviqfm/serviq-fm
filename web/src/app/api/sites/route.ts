// web/src/app/api/sites/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { enforceFieldConfig } from '@/lib/fieldEnforcement'
import { planLimits, siteLimitReached } from '@/lib/planLimits'

export const dynamic = 'force-dynamic'

// Parse a lat/long value from the form (string or number) into a finite number,
// or null when blank/invalid. Keeps a bad coordinate out of the DB.
function toCoord(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

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
    console.error('[sites POST] profile lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  // AP-02: site-limit enforcement. FAIL OPEN — unknown/null plan_tier, an unlimited
  // tier, or any lookup error ALLOWS creation so existing orgs are never blocked.
  {
    const { data: orgRow } = await supabase
      .from('organisations')
      .select('plan_tier')
      .eq('id', profile.organisation_id)
      .single()
    const planTier = orgRow?.plan_tier as string | null | undefined
    if (planLimits(planTier)?.maxSites != null) {
      const { count } = await supabase
        .from('sites')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', profile.organisation_id)
        .eq('is_active', true)
      if (typeof count === 'number' && siteLimitReached(planTier, count)) {
        return NextResponse.json(
          {
            error: `Your plan's site limit has been reached. Upgrade your plan to add more sites.`,
            error_ar: 'لقد وصلت مؤسستك إلى الحد الأقصى لعدد المواقع في خطتك. يرجى ترقية الخطة لإضافة المزيد من المواقع.',
          },
          { status: 403 }
        )
      }
    }
  }

  const body = (await req.json()) as Record<string, unknown>

  const enforcePayload: Record<string, unknown> = {
    name: body.name,
    name_ar: body.name_ar,
    city: body.city,
    address: body.address,
    latitude: body.latitude,
    longitude: body.longitude,
  }

  const enforcement = await enforceFieldConfig(profile.organisation_id, 'sites_new', enforcePayload)
  if ('error' in enforcement) {
    return NextResponse.json({ error: enforcement.error }, { status: 400 })
  }
  const cleaned = enforcement.cleaned

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const insertRow: Record<string, unknown> = {
    organisation_id: profile.organisation_id,
    name: cleaned.name ?? null,
    name_ar: cleaned.name_ar ? cleaned.name_ar : null,
    city: cleaned.city ? cleaned.city : null,
    address: cleaned.address ? cleaned.address : null,
    latitude: toCoord(cleaned.latitude),
    longitude: toCoord(cleaned.longitude),
    is_active: true,
  }

  const { data, error } = await admin
    .from('sites')
    .insert(insertRow)
    .select()
    .single()

  if (error) {
    console.error('[sites POST] insert failed', error)
    return NextResponse.json({ error: error.message || 'Failed to create site' }, { status: 500 })
  }
  return NextResponse.json({ site: data })
}
