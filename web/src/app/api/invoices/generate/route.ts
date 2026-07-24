import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateZATCAQRData, formatSAR } from '@/lib/zatca'
import { renderToBuffer, Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { resolveBranding } from '@/lib/branding'
import React from 'react'

const styles = StyleSheet.create({
  page:            { padding: 40, fontFamily: 'Helvetica', backgroundColor: '#ffffff' },
  brandLogo:       { maxHeight: 44, maxWidth: 160, marginBottom: 8, objectFit: 'contain' },
  header:          { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32, borderBottomWidth: 2, borderBottomColor: '#1E2D4E', paddingBottom: 16 },
  companyName:     { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#1E2D4E' },
  companySubtitle: { fontSize: 9, color: '#A0B0BF', marginTop: 2 },
  invoiceTitle:    { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#1E2D4E', textAlign: 'right' },
  invoiceNumber:   { fontSize: 11, color: '#6DCFB0', textAlign: 'right', marginTop: 4 },
  sectionTitle:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#A0B0BF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  row:             { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label:           { fontSize: 11, color: '#4A5568' },
  value:           { fontSize: 11, color: '#1E2D4E', fontFamily: 'Helvetica-Bold' },
  tableHeader:     { flexDirection: 'row', backgroundColor: '#F8FAFC', padding: '8 12', marginBottom: 2 },
  tableRow:        { flexDirection: 'row', padding: '8 12', borderBottomWidth: 1, borderBottomColor: '#E8ECF0' },
  tableCell:       { fontSize: 11, color: '#4A5568' },
  tableCellBold:   { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1E2D4E' },
  totalsBox:       { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 8, marginTop: 16 },
  totalLine:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  grandTotal:      { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: '#1E2D4E', paddingTop: 8, marginTop: 4 },
  grandTotalLabel: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1E2D4E' },
  grandTotalValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#6DCFB0' },
  footer:          { position: 'absolute', bottom: 30, left: 40, right: 40, borderTopWidth: 1, borderTopColor: '#E8ECF0', paddingTop: 8 },
  footerText:      { fontSize: 9, color: '#A0B0BF', textAlign: 'center' },
  qrSection:       { alignItems: 'center', marginTop: 24 },
  qrLabel:         { fontSize: 9, color: '#A0B0BF', marginTop: 4 },
})

type SparePart = { name: string; qty: number; unit_cost: number; total: number }
type Surcharge  = { label: string; amount: number }

export async function POST(req: NextRequest) {
  try {
    const { invoiceId } = await req.json()
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })

    const supabase = await createServerSupabaseClient()

    // Explicit auth + org scoping (defense-in-depth over RLS).
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('organisation_id')
      .eq('id', user.id)
      .single()
    if (!profile?.organisation_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }

    const { data: inv, error: invErr } = await supabase
      .from('invoices')
      .select('*, work_order:work_order_id(title, completed_at, assignee:assigned_to(full_name), asset:asset_id(name), organisation:organisation_id(*))')
      .eq('id', invoiceId)
      .single()

    if (invErr || !inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    // The invoice must belong to the caller's organisation.
    if ((inv as { organisation_id?: string }).organisation_id !== profile.organisation_id) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invoice = inv as any
    const wo      = invoice.work_order ?? {}
    const org     = wo.organisation ?? {}

    // MKT-27: apply the tenant's custom branding when the flag is on and branding is set.
    // Permissive default (matches featureFlags.ts) — a missing flag row = feature on.
    let brandingEnabled = true
    const { data: flagRow } = await supabase
      .from('tenant_feature_flags')
      .select('custom_branding')
      .eq('organisation_id', profile.organisation_id)
      .single()
    if (flagRow && typeof (flagRow as { custom_branding?: boolean }).custom_branding === 'boolean') {
      brandingEnabled = (flagRow as { custom_branding: boolean }).custom_branding
    }
    const branding = resolveBranding(org, brandingEnabled)
    // Colours below are already strict-hex-validated by resolveBranding (CSS-injection safe).
    const accent  = branding?.primary   ?? '#1E2D4E'
    const accent2 = branding?.secondary ?? '#6DCFB0'
    // Fetch the logo bytes ourselves (not via <Image src=remoteUrl>): renderToBuffer
    // awaits the remote fetch, so a dangling/unreachable logo URL would otherwise
    // reject and 500 the ENTIRE invoice (a cosmetic feature must not break ZATCA docs).
    let logoData: string | null = null
    if (branding?.logoUrl) {
      try {
        const r = await fetch(branding.logoUrl)
        if (r.ok) {
          const ct = r.headers.get('content-type') || 'image/png'
          logoData = `data:${ct};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`
        }
      } catch { /* unreachable logo → render the invoice without it */ }
    }

    const invoiceDate = invoice.created_at

    const qrData = generateZATCAQRData({
      sellerName:   org.name ?? 'Unknown',
      vatNumber:    org.vat_number ?? '000000000000000',
      invoiceDate,
      totalWithVAT: invoice.total,
      vatAmount:    invoice.vat_amount,
    })

    const spareParts: SparePart[] = Array.isArray(invoice.spare_parts) ? invoice.spare_parts : []
    const surcharges: Surcharge[] = Array.isArray(invoice.surcharges)  ? invoice.surcharges  : []

    const pdfDoc = React.createElement(
      Document, null,
      React.createElement(Page, { size: 'A4', style: styles.page },

        // Header
        React.createElement(View, { style: [styles.header, { borderBottomColor: accent }] },
          React.createElement(View, null,
            logoData ? React.createElement(Image, { src: logoData, style: styles.brandLogo }) : null,
            React.createElement(Text, { style: [styles.companyName, { color: accent }] }, org.name ?? 'Company'),
            org.name_ar    ? React.createElement(Text, { style: styles.companySubtitle }, org.name_ar) : null,
            org.vat_number ? React.createElement(Text, { style: styles.label }, 'VAT: ' + org.vat_number) : null,
            org.cr_number  ? React.createElement(Text, { style: styles.label }, 'CR: ' + org.cr_number) : null,
            org.address    ? React.createElement(Text, { style: styles.label }, org.address + (org.city ? ', ' + org.city : '')) : null,
            org.phone      ? React.createElement(Text, { style: styles.label }, org.phone) : null,
          ),
          React.createElement(View, null,
            React.createElement(Text, { style: [styles.invoiceTitle, { color: accent }] }, 'TAX INVOICE'),
            React.createElement(Text, { style: [styles.invoiceNumber, { color: accent2 }] }, invoice.invoice_number),
            React.createElement(Text, { style: [styles.label, { textAlign: 'right', marginTop: 8 }] }, 'Date: ' + new Date(invoiceDate).toLocaleDateString('en-SA')),
          ),
        ),

        // Service Details
        React.createElement(View, { style: { marginBottom: 24 } },
          React.createElement(Text, { style: styles.sectionTitle }, 'SERVICE DETAILS'),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Work Order:'),
            React.createElement(Text, { style: styles.value }, wo.title ?? ''),
          ),
          wo.asset ? React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Asset:'),
            React.createElement(Text, { style: styles.value }, wo.asset.name ?? ''),
          ) : null,
          wo.assignee ? React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Technician:'),
            React.createElement(Text, { style: styles.value }, wo.assignee.full_name ?? ''),
          ) : null,
          wo.completed_at ? React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Completed:'),
            React.createElement(Text, { style: styles.value }, new Date(wo.completed_at).toLocaleDateString('en-SA')),
          ) : null,
        ),

        // Line Items
        React.createElement(View, { style: { marginBottom: 8 } },
          React.createElement(Text, { style: styles.sectionTitle }, 'CHARGES'),

          React.createElement(View, { style: styles.tableHeader },
            React.createElement(Text, { style: [styles.tableCellBold, { flex: 4 }] }, 'Description'),
            React.createElement(Text, { style: [styles.tableCellBold, { flex: 1, textAlign: 'right' }] }, 'Amount'),
          ),

          invoice.service_charges > 0
            ? React.createElement(View, { style: styles.tableRow },
                React.createElement(Text, { style: [styles.tableCell, { flex: 4 }] }, 'Service Charges'),
                React.createElement(Text, { style: [styles.tableCell, { flex: 1, textAlign: 'right' }] }, formatSAR(invoice.service_charges)),
              )
            : null,

          invoice.labor_charges > 0
            ? React.createElement(View, { style: styles.tableRow },
                React.createElement(Text, { style: [styles.tableCell, { flex: 4 }] }, 'Labour Charges (' + invoice.labor_hours + ' hrs × SAR ' + invoice.labor_rate + '/hr)'),
                React.createElement(Text, { style: [styles.tableCell, { flex: 1, textAlign: 'right' }] }, formatSAR(invoice.labor_charges)),
              )
            : null,

          ...spareParts.map((p: SparePart, i: number) =>
            React.createElement(View, { key: 'p' + i, style: styles.tableRow },
              React.createElement(Text, { style: [styles.tableCell, { flex: 4 }] }, p.name + ' × ' + p.qty),
              React.createElement(Text, { style: [styles.tableCell, { flex: 1, textAlign: 'right' }] }, formatSAR(p.total)),
            )
          ),

          ...surcharges.map((s: Surcharge, i: number) =>
            React.createElement(View, { key: 's' + i, style: styles.tableRow },
              React.createElement(Text, { style: [styles.tableCell, { flex: 4 }] }, s.label),
              React.createElement(Text, { style: [styles.tableCell, { flex: 1, textAlign: 'right' }] }, formatSAR(s.amount)),
            )
          ),
        ),

        // Totals
        React.createElement(View, { style: styles.totalsBox },
          React.createElement(View, { style: styles.totalLine },
            React.createElement(Text, { style: styles.label }, 'Subtotal (excl. VAT)'),
            React.createElement(Text, { style: styles.value }, formatSAR(invoice.subtotal)),
          ),
          React.createElement(View, { style: styles.totalLine },
            React.createElement(Text, { style: styles.label }, 'VAT (15%)'),
            React.createElement(Text, { style: styles.value }, formatSAR(invoice.vat_amount)),
          ),
          React.createElement(View, { style: [styles.grandTotal, { borderTopColor: accent }] },
            React.createElement(Text, { style: [styles.grandTotalLabel, { color: accent }] }, 'TOTAL (incl. VAT)'),
            React.createElement(Text, { style: [styles.grandTotalValue, { color: accent2 }] }, formatSAR(invoice.total)),
          ),
        ),

        // ZATCA QR
        React.createElement(View, { style: styles.qrSection },
          React.createElement(Text, { style: styles.qrLabel }, 'ZATCA Phase 2 — Scan to verify'),
          React.createElement(Text, { style: [styles.qrLabel, { marginTop: 8, fontSize: 8, color: '#4A5568' }] }, 'QR Data: ' + qrData.slice(0, 40) + '...'),
        ),

        // Footer
        React.createElement(View, { style: styles.footer },
          React.createElement(Text, { style: styles.footerText },
            (org.name ?? '') + ' · VAT ' + (org.vat_number ?? 'N/A') + ' · ' + (org.address ?? '') + ' · Generated by ServIQ FM'
          ),
        ),
      )
    )

    const pdfBuffer = await renderToBuffer(pdfDoc)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.invoice_number}.pdf"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
