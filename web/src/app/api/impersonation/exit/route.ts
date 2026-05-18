// web/src/app/api/impersonation/exit/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import {
  verifyImpersonationCookie,
  IMPERSONATION_COOKIE_NAME,
} from '@/lib/impersonation'
import { logPlatformAction } from '@/lib/platformAudit'

export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cookieStore = cookies()
  const tokenCookie = cookieStore.get(IMPERSONATION_COOKIE_NAME)
  const verified = verifyImpersonationCookie(tokenCookie?.value)
  if (!verified.valid) {
    return NextResponse.json({ error: 'No active impersonation' }, { status: 400 })
  }
  if (verified.platformAdminId !== user.id) {
    return NextResponse.json({ error: 'Mismatched session' }, { status: 403 })
  }

  // Parse issued_at from raw cookie to compute duration
  let durationSeconds: number | null = null
  try {
    const [bodyB64] = (tokenCookie!.value).split('.')
    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf-8'))
    durationSeconds = Math.floor((Date.now() - payload.issued_at) / 1000)
  } catch {
    /* ignore */
  }

  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'impersonation.end',
    target_organisation_id: verified.orgId,
    details: { duration_seconds: durationSeconds },
  })

  const res = NextResponse.json({ success: true })
  res.cookies.delete(IMPERSONATION_COOKIE_NAME)
  return res
}
