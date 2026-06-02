import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { buildOffboardZip, uploadOffboardZip } from '@/lib/offboardExport'
import { logPlatformAction } from '@/lib/platformAudit'
import { Resend } from 'resend'

export const runtime = 'nodejs'
// Offboarding dumps 13 tables, builds a zip, uploads to storage, and sends an email.
// On larger tenants this can take 30-60s; default Vercel timeout (10s) is too short.
export const maxDuration = 60

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
  let buffer: Buffer, filename: string, signedUrl: string
  try {
    ({ buffer, filename } = await buildOffboardZip(params.id))
  } catch (e) {
    console.error('[offboard] build zip failed', e)
    return NextResponse.json({ error: 'Failed to build export zip: ' + (e instanceof Error ? e.message : String(e)) }, { status: 500 })
  }
  try {
    signedUrl = await uploadOffboardZip(filename, buffer)
  } catch (e) {
    console.error('[offboard] upload zip failed', e)
    return NextResponse.json({ error: 'Failed to upload export. Make sure the "offboard-exports" storage bucket exists. (' + (e instanceof Error ? e.message : String(e)) + ')' }, { status: 500 })
  }

  // 2. Snapshot all tenant users BEFORE we delete them — we need the emails for the
  // offboarding email and the auth user ids for the auth.users hard-delete.
  const { data: tenantUsers } = await admin
    .from('users')
    .select('id, email, role')
    .eq('organisation_id', params.id)
  const userIds = (tenantUsers ?? []).map((u: { id: string }) => u.id)
  const adminEmails = (tenantUsers ?? []).filter((u: { role: string }) => u.role === 'admin').map((u: { email: string }) => u.email).filter(Boolean)

  // 3. Update organisation FIRST so the offboarded_at marker is set even if later
  // deletes fail. The org row is preserved (for export-download access + audit).
  await admin.from('organisations').update({
    offboarded_at: new Date().toISOString(),
    offboarded_by: user.id,
    offboard_export_url: filename,
  }).eq('id', params.id)

  // 4. Send the offboarding email BEFORE deleting users — recipients are derived from
  // the snapshot above so it works even after the rows are gone.
  const recipients = Array.from(new Set([...adminEmails, pa.email]))
  if (process.env.RESEND_API_KEY && recipients.length > 0) {
    const resend = new Resend(process.env.RESEND_API_KEY)
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? 'noreply@serviqfm.com',
        to: recipients,
        subject: `Offboarding export for ${org.name}`,
        html: `<p>Your organisation has been offboarded from ServIQ-FM.</p>
               <p>Download your data export (valid 30 days): <a href="${signedUrl}">${signedUrl}</a></p>
               <p>This is the last email you will receive — your user accounts have been removed and your emails are now free for reuse.</p>`,
      })
    } catch (e) {
      console.error('[offboard] email send failed (continuing)', e)
    }
  }

  // 5. Hard-delete tenant users so their emails are freed up for reuse. We delete:
  //    a) auth.users entries (admin.auth.admin.deleteUser) — frees email globally
  //    b) public.users rows (FK cascades may handle this already, but be explicit)
  let deletedCount = 0
  for (const uid of userIds) {
    try {
      await admin.auth.admin.deleteUser(uid)
      deletedCount++
    } catch (e) {
      console.error('[offboard] auth.users delete failed for', uid, e)
    }
  }
  // Belt-and-braces: explicitly delete any remaining public.users rows for the org.
  // If a FK cascade already removed them this is a no-op.
  await admin.from('users').delete().eq('organisation_id', params.id)

  // 6. Audit
  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'tenant.offboard',
    target_organisation_id: params.id,
    details: {
      org_id: params.id,
      org_name: org.name,
      export_url: filename,
      users_deleted_count: deletedCount,
      users_emailed: recipients.length,
    },
  })

  return NextResponse.json({ success: true, signed_url: signedUrl, users_deleted: deletedCount })
}
