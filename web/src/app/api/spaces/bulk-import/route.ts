import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

type IncomingRow = {
  name?: string
  name_ar?: string
  floor?: string
  description?: string
}

// Server-side bulk import for spaces. Browser inserts hit RLS even when the user
// owns the parent site, depending on how the policy is written. This endpoint:
//  1. Verifies the caller is signed in and belongs to the site's organisation
//  2. Inserts via the service-role key (bypasses RLS but is org-scoped in app code)
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation found for user' }, { status: 403 })
  }

  const body = (await req.json()) as { site_id?: string; rows?: IncomingRow[] }
  if (!body.site_id || !Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'site_id and a non-empty rows array are required' }, { status: 400 })
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify the user's org owns the target site.
  const { data: site, error: siteErr } = await admin
    .from('sites')
    .select('id, organisation_id')
    .eq('id', body.site_id)
    .single()
  if (siteErr || !site) {
    return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  }
  if (site.organisation_id !== profile.organisation_id) {
    return NextResponse.json({ error: 'Site does not belong to your organisation' }, { status: 403 })
  }

  // AL-19 — validate + dedupe per row so a partial file still imports the good
  // rows and reports the rest. Dedupe key is name+floor (case-insensitive),
  // both within the batch and against spaces already in this site.
  const { data: existing } = await admin
    .from('spaces')
    .select('name, floor')
    .eq('site_id', body.site_id)
  const seen = new Set<string>(
    (existing ?? []).map(s => `${(s.name ?? '').trim().toLowerCase()}|${(s.floor ?? '').trim().toLowerCase()}`)
  )

  const errors: string[] = []
  let skipped = 0
  const payload: {
    site_id: string; organisation_id: string
    name: string; name_ar: string | null; floor: string; description: string | null
  }[] = []

  body.rows.forEach((r, i) => {
    const rowNo = i + 2 // header is row 1
    const name = r.name?.trim()
    if (!name) { errors.push(`Row ${rowNo}: missing name — skipped`); return }
    const floor = r.floor?.trim() || 'Ground'
    const key = `${name.toLowerCase()}|${floor.toLowerCase()}`
    if (seen.has(key)) { skipped++; return }
    seen.add(key)
    payload.push({
      site_id: body.site_id!,
      organisation_id: profile.organisation_id,
      name,
      name_ar: r.name_ar?.trim() || null,
      floor,
      description: r.description?.trim() || null,
    })
  })

  if (payload.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, errors })
  }

  // Some Supabase projects have a `spaces` table without `organisation_id` (it's
  // scoped via site_id only). Try with org_id first, then fall back without it.
  const firstAttempt = await admin.from('spaces').insert(payload).select('id')
  let inserted = firstAttempt.data?.length ?? 0
  let lastError = firstAttempt.error

  if (firstAttempt.error && /organisation_id|column .* does not exist/i.test(firstAttempt.error.message)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const minimalPayload = payload.map(({ organisation_id, ...rest }) => rest)
    const retry = await admin.from('spaces').insert(minimalPayload).select('id')
    inserted = retry.data?.length ?? 0
    lastError = retry.error
  }

  if (lastError) {
    return NextResponse.json({ error: lastError.message }, { status: 500 })
  }

  return NextResponse.json({ inserted, skipped, errors })
}
