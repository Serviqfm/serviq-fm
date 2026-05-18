import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyImpersonationCookie, IMPERSONATION_COOKIE_NAME } from '@/lib/impersonation'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(_req: NextRequest) {
  const c = cookies().get(IMPERSONATION_COOKIE_NAME)
  const verified = verifyImpersonationCookie(c?.value)
  if (!verified.valid) return NextResponse.json({ impersonating: false })

  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name')
    .eq('id', verified.orgId)
    .single()
  return NextResponse.json({
    impersonating: true,
    org_id: verified.orgId,
    org_name: org?.name ?? 'Unknown',
  })
}
