import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { renderToBuffer, Document, Page, Text, View } from '@react-pdf/renderer'
import { reportStyles as s } from '@/lib/pdf-report-styles'
import { formatSAR } from '@/lib/currency'
import React from 'react'

export const runtime = 'nodejs'

type LineItem = { description: string; qty: number; unit_price_cents: number; total_cents: number }

export async function GET(_req: NextRequest, { params }: { params: { id: string; invoiceId: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Permit platform admins OR tenant members of the org that owns the invoice.
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  const isPlatformAdmin = !!pa
  let allowed = isPlatformAdmin
  if (!allowed) {
    const { data: profile } = await admin.from('users').select('organisation_id').eq('id', user.id).single()
    allowed = !!profile && profile.organisation_id === params.id
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch the invoice and the org separately so a missing column on organisations (e.g.
  // address/city/country may not exist on every Supabase project) does not nuke the join
  // and surface as a useless 'Invoice not found'.
  const { data: inv, error } = await admin
    .from('tenant_invoices')
    .select('*')
    .eq('id', params.invoiceId)
    .eq('organisation_id', params.id)
    .single() as { data: (Record<string, unknown> & { line_items: LineItem[] }) | null; error: { message: string; code?: string } | null }
  if (error || !inv) {
    console.error('[invoice pdf] not found', { invoiceId: params.invoiceId, orgId: params.id, error })
    return NextResponse.json({ error: 'Invoice not found', detail: error?.message }, { status: 404 })
  }
  const { data: orgRow } = await admin
    .from('organisations')
    .select('*')
    .eq('id', params.id)
    .single() as { data: Record<string, unknown> | null }
  const org = (orgRow ?? {}) as { name?: string; vat_number?: string; cr_number?: string; address?: string; city?: string; country?: string }

  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const items = (inv.line_items ?? []) as LineItem[]
  const issueDate = inv.issue_date ? new Date(String(inv.issue_date)).toLocaleDateString('en-GB') : '—'
  const dueDate = inv.due_date ? new Date(String(inv.due_date)).toLocaleDateString('en-GB') : '—'

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>ServIQ-FM</Text>
            <Text style={s.brandSub}>Tax Invoice / فاتورة ضريبية</Text>
          </View>
          <View>
            <Text style={s.reportTitle}>{String(inv.invoice_number)}</Text>
            <Text style={s.reportMeta}>Issued {issueDate} · Due {dueDate}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <View style={{ width: '48%' }}>
            <Text style={s.sectionTitle}>Bill To</Text>
            <Text style={{ ...s.paragraph, fontFamily: 'Helvetica-Bold' }}>{org.name ?? '—'}</Text>
            {Boolean(org.vat_number) && <Text style={s.paragraph}>VAT: {org.vat_number}</Text>}
            {Boolean(org.cr_number) && <Text style={s.paragraph}>CR: {org.cr_number}</Text>}
            {[org.address, org.city, org.country].filter(Boolean).length > 0 && (
              <Text style={s.paragraph}>{[org.address, org.city, org.country].filter(Boolean).join(', ')}</Text>
            )}
          </View>
          <View style={{ width: '48%' }}>
            <Text style={s.sectionTitle}>From</Text>
            <Text style={{ ...s.paragraph, fontFamily: 'Helvetica-Bold' }}>ServIQ-FM</Text>
            <Text style={s.paragraph}>noreply@serviqfm.com</Text>
            <Text style={s.paragraph}>Saudi Arabia</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Line Items</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <View style={{ ...s.tableHeaderCell, width: '54%' }}><Text>Description</Text></View>
            <View style={{ ...s.tableHeaderCell, width: '12%' }}><Text>Qty</Text></View>
            <View style={{ ...s.tableHeaderCell, width: '17%' }}><Text>Unit price</Text></View>
            <View style={{ ...s.tableHeaderCell, width: '17%' }}><Text>Total</Text></View>
          </View>
          {items.map((li, i) => (
            <View key={i} style={s.tableRow}>
              <View style={{ ...s.tableCell, width: '54%' }}><Text>{li.description}</Text></View>
              <View style={{ ...s.tableCell, width: '12%' }}><Text>{li.qty}</Text></View>
              <View style={{ ...s.tableCell, width: '17%' }}><Text>{formatSAR(li.unit_price_cents)}</Text></View>
              <View style={{ ...s.tableCell, width: '17%' }}><Text>{formatSAR(li.total_cents)}</Text></View>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 14, alignItems: 'flex-end' }}>
          <View style={{ width: '40%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={s.paragraph}>Subtotal</Text>
              <Text style={s.paragraph}>{formatSAR(Number(inv.subtotal_cents))}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={s.paragraph}>VAT (15%)</Text>
              <Text style={s.paragraph}>{formatSAR(Number(inv.vat_cents))}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 2, borderTopColor: '#006b54', marginTop: 4 }}>
              <Text style={{ ...s.paragraph, fontFamily: 'Helvetica-Bold' }}>Total</Text>
              <Text style={{ ...s.paragraph, fontFamily: 'Helvetica-Bold', color: '#006b54' }}>{formatSAR(Number(inv.total_cents))}</Text>
            </View>
          </View>
        </View>

        {Boolean(inv.notes) && (
          <>
            <Text style={s.sectionTitle}>Notes</Text>
            <Text style={s.paragraph}>{String(inv.notes)}</Text>
          </>
        )}

        <View style={s.footer}>
          <Text style={s.footerText}>ServIQ-FM · Status: {String(inv.status)} · Generated {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  )

  const buffer = await renderToBuffer(doc)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${String(inv.invoice_number)}.pdf"`,
    },
  })
}
