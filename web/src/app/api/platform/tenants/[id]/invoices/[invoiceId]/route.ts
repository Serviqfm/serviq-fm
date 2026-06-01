import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'
import { Resend } from 'resend'
import { formatSAR } from '@/lib/currency'

export const runtime = 'nodejs'

const VALID_STATUS = ['draft', 'sent', 'paid', 'void'] as const
type InvoiceStatus = typeof VALID_STATUS[number]

async function gate() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user, admin }
}

// PATCH: update status, optionally email the invoice to tenant admins.
export async function PATCH(req: NextRequest, { params }: { params: { id: string; invoiceId: string } }) {
  const g = await gate()
  if ('error' in g) return g.error
  const { admin, user } = g

  const body = await req.json() as { status?: InvoiceStatus; send_email?: boolean }
  if (body.status && !VALID_STATUS.includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.status) update.status = body.status

  let invoice: { id: string; invoice_number: string; total_cents: number; status: string } | null = null
  if (Object.keys(update).length > 0) {
    const { data, error } = await admin.from('tenant_invoices').update(update)
      .eq('id', params.invoiceId).eq('organisation_id', params.id).select().single()
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 })
    invoice = data as unknown as { id: string; invoice_number: string; total_cents: number; status: string }
  } else {
    const { data } = await admin.from('tenant_invoices').select('*')
      .eq('id', params.invoiceId).eq('organisation_id', params.id).single()
    invoice = data as unknown as { id: string; invoice_number: string; total_cents: number; status: string } | null
  }
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Optional: email the invoice PDF to all tenant admins + the platform admin.
  let emailedTo: string[] = []
  if (body.send_email) {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email not configured (RESEND_API_KEY missing)' }, { status: 500 })
    }
    const { data: orgRow } = await admin.from('organisations').select('name').eq('id', params.id).single() as { data: { name?: string } | null }
    const orgName = orgRow?.name ?? 'Tenant'
    const { data: admins } = await admin.from('users').select('email').eq('organisation_id', params.id).eq('role', 'admin')
    emailedTo = Array.from(new Set([
      ...(admins ?? []).map((a: { email: string }) => a.email).filter(Boolean),
    ]))
    if (emailedTo.length === 0) {
      return NextResponse.json({ error: 'No tenant admins to email' }, { status: 400 })
    }

    // Render the PDF by calling our own endpoint (server-to-server).
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'
    // We cannot easily call the user-authenticated PDF endpoint from server. Instead, generate
    // the same content here inline by importing the renderer. Simpler: link them back.
    const downloadUrl = `${appUrl}/api/platform/tenants/${params.id}/invoices/${params.invoiceId}/pdf`

    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'noreply@serviqfm.com',
      to: emailedTo,
      subject: `Invoice ${invoice.invoice_number} — ${orgName}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #1E2D4E;">
          <h2 style="color:#006b54;">Invoice ${invoice.invoice_number}</h2>
          <p>Dear ${orgName} admin,</p>
          <p>Please find your invoice for the amount of <strong>${formatSAR(invoice.total_cents)}</strong>.</p>
          <p><a href="${downloadUrl}" style="background:#006b54;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Download Invoice PDF</a></p>
          <p style="font-size:12px;color:#888;">If the button does not work, paste this link into your browser:<br/>${downloadUrl}</p>
          <p>— ServIQ-FM</p>
        </div>
      `,
    })

    // Bump status to 'sent' if we just emailed and it was 'draft'.
    if (invoice.status === 'draft' || body.status === 'sent') {
      await admin.from('tenant_invoices').update({ status: 'sent' })
        .eq('id', params.invoiceId).eq('organisation_id', params.id)
      invoice.status = 'sent'
    }
  }

  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'tenant.invoice.created',
    target_organisation_id: params.id,
    details: {
      invoice_number: invoice.invoice_number,
      status: invoice.status,
      emailed_to: emailedTo,
      change: body.status ? `status -> ${body.status}` : null,
    },
  })

  return NextResponse.json({ invoice, emailed_to: emailedTo })
}
