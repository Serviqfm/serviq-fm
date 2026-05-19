import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { buildOffboardZip, uploadOffboardZip } from '@/lib/offboardExport'
import { logPlatformAction } from '@/lib/platformAudit'
import { Resend } from 'resend'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id, email').eq('id', user.id).single()
  if (!pa) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: org } = await admin.from('organisations').select('id, name, offboarded_at').eq('id', params.id).single()
  if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (org.offboarded_at) return NextResponse.json({ error: 'Already offboarded' }, { status: 400 })

  // 1. Build + upload zip
  const { buffer, filename } = await buildOffboardZip(params.id)
  const signedUrl = await uploadOffboardZip(filename, buffer)

  // 2. Update organisation
  await admin.from('organisations').update({
    offboarded_at: new Date().toISOString(),
    offboarded_by: user.id,
    offboard_export_url: filename,
  }).eq('id', params.id)

  // 3. Disable all tenant users
  const { data: disabledUsers } = await admin
    .from('users')
    .update({ disabled: true })
    .eq('organisation_id', params.id)
    .select('id')
  const disabledCount = disabledUsers?.length ?? 0

  // 4. Email signed URL to all tenant admins + platform admin
  const { data: admins } = await admin.from('users').select('email').eq('organisation_id', params.id).eq('role', 'admin')
  const recipients = Array.from(new Set([...(admins ?? []).map((a: { email: string }) => a.email), pa.email]))
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@serviqfm.com',
      to: recipients,
      subject: `Offboarding export for ${org.name}`,
      html: `<p>Your organisation has been offboarded from ServIQ-FM.</p>
             <p>Download your data export (valid 30 days): <a href="${signedUrl}">${signedUrl}</a></p>`,
    })
  }

  // 5. Audit
  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'tenant.offboard',
    target_organisation_id: params.id,
    details: { org_id: params.id, org_name: org.name, export_url: filename, users_disabled_count: disabledCount },
  })

  return NextResponse.json({ success: true, signed_url: signedUrl })
}
