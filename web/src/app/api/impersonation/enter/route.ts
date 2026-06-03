// web/src/app/api/impersonation/enter/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  signImpersonationCookie,
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_TTL_MS,
} from '@/lib/impersonation'
import { logPlatformAction } from '@/lib/platformAudit'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Need the service-role client to read organisations across tenants — the
  // auth'd client is blocked by org-scoped RLS on the organisations table,
  // which is what made this endpoint return 'Org not found' for valid tenants.
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify caller is a platform admin
  const { data: pa } = await admin
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { org_id } = (await req.json()) as { org_id?: string }
  if (!org_id) return NextResponse.json({ error: 'Missing org_id' }, { status: 400 })

  // Verify the org exists and is not offboarded
  const { data: org, error: orgErr } = await admin
    .from('organisations')
    .select('id, name, offboarded_at')
    .eq('id', org_id)
    .single()
  if (orgErr || !org) {
    console.error('[impersonation enter] org lookup failed', { org_id, error: orgErr })
    return NextResponse.json({ error: 'Org not found', detail: orgErr?.message }, { status: 404 })
  }
  if (org.offboarded_at) {
    return NextResponse.json({ error: 'Cannot impersonate offboarded org' }, { status: 400 })
  }

  let token: string
  try {
    token = signImpersonationCookie({
      platform_admin_id: user.id,
      org_id,
      issued_at: Date.now(),
    })
  } catch (e) {
    console.error('[impersonation enter] sign cookie failed', e)
    return NextResponse.json({ error: 'Could not sign impersonation cookie: ' + (e instanceof Error ? e.message : String(e)) }, { status: 500 })
  }

  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'impersonation.start',
    target_organisation_id: org_id,
    details: { org_name: org.name, ttl_minutes: IMPERSONATION_TTL_MS / 60000 },
  })

  const res = NextResponse.json({ success: true })
  res.cookies.set(IMPERSONATION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: IMPERSONATION_TTL_MS / 1000,
    path: '/',
  })
  return res
}
