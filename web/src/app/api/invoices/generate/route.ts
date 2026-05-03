import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateZATCAQRData, formatSAR, calcVAT } from '@/lib/zatca'
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    borderBottomWidth: 2,
    borderBottomColor: '#1E2D4E',
    paddingBottom: 16,
  },
  companyName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#1E2D4E' },
  companySubtitle: { fontSize: 9, color: '#A0B0BF', marginTop: 2 },
  invoiceTitle: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#1E2D4E', textAlign: 'right' },
  invoiceNumber: { fontSize: 11, color: '#6DCFB0', textAlign: 'right', marginTop: 4 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#A0B0BF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  label: { fontSize: 11, color: '#4A5568' },
  value: { fontSize: 11, color: '#1E2D4E', fontFamily: 'Helvetica-Bold' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F8FAFC', padding: '8 12', marginBottom: 2 },
  tableRow: { flexDirection: 'row', padding: '8 12', borderBottomWidth: 1, borderBottomColor: '#E8ECF0' },
  tableCell: { fontSize: 11, color: '#4A5568' },
  tableCellBold: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#1E2D4E' },
  totalsBox: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 8, marginTop: 16 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderTopColor: '#1E2D4E', paddingTop: 8, marginTop: 4 },
  grandTotalLabel: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#1E2D4E' },
  grandTotalValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#6DCFB0' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTopWidth: 1, borderTopColor: '#E8ECF0', paddingTop: 8 },
  footerText: { fontSize: 9, color: '#A0B0BF', textAlign: 'center' },
  qrSection: { alignItems: 'center', marginTop: 24 },
  qrLabel: { fontSize: 9, color: '#A0B0BF', marginTop: 4 },
})

export async function POST(req: NextRequest) {
  try {
    const { workOrderId } = await req.json()
    if (!workOrderId) return NextResponse.json({ error: 'workOrderId required' }, { status: 400 })

    const supabase = await createServerSupabaseClient()

    const { data: woData, error: woSingleError } = await supabase
      .from('work_orders')
      .select('*, organisation:organisation_id(*), assignee:assigned_to(full_name, email), asset:asset_id(name, serial_number)')
      .eq('id', workOrderId)
      .single()

    if (woSingleError || !woData) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const workOrder = woData as any
    const org = workOrder.organisation ?? {}
    const subtotal = Number(workOrder.actual_cost ?? 0)
    const { vat, total } = calcVAT(subtotal)
    const invoiceDate = new Date().toISOString()
    const invoiceNumber = 'INV-' + Date.now().toString().slice(-8)

    const qrData = generateZATCAQRData({
      sellerName: org.name ?? 'Unknown',
      vatNumber: org.vat_number ?? '000000000000000',
      invoiceDate,
      totalWithVAT: total,
      vatAmount: vat,
    })

    const pdfDoc = React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: 'A4', style: styles.page },
        // Header
        React.createElement(
          View,
          { style: styles.header },
          React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.companyName }, org.name ?? 'Company'),
            org.name_ar ? React.createElement(Text, { style: styles.companySubtitle }, org.name_ar) : null,
            org.vat_number ? React.createElement(Text, { style: styles.label }, 'VAT: ' + org.vat_number) : null,
            org.cr_number ? React.createElement(Text, { style: styles.label }, 'CR: ' + org.cr_number) : null,
            org.address ? React.createElement(Text, { style: styles.label }, org.address + (org.city ? ', ' + org.city : '')) : null,
            org.phone ? React.createElement(Text, { style: styles.label }, org.phone) : null,
          ),
          React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.invoiceTitle }, 'TAX INVOICE'),
            React.createElement(Text, { style: styles.invoiceNumber }, invoiceNumber),
            React.createElement(Text, { style: [styles.label, { textAlign: 'right', marginTop: 8 }] }, 'Date: ' + new Date(invoiceDate).toLocaleDateString('en-SA')),
          )
        ),
        // Service details
        React.createElement(
          View,
          { style: { marginBottom: 24 } },
          React.createElement(Text, { style: styles.sectionTitle }, 'SERVICE DETAILS'),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Work Order:'),
            React.createElement(Text, { style: styles.value }, workOrder.title ?? '')
          ),
          workOrder.asset ? React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Asset:'),
            React.createElement(Text, { style: styles.value }, workOrder.asset.name ?? '')
          ) : null,
          workOrder.assignee ? React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Technician:'),
            React.createElement(Text, { style: styles.value }, workOrder.assignee.full_name ?? '')
          ) : null,
          workOrder.completed_at ? React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Completed:'),
            React.createElement(Text, { style: styles.value }, new Date(workOrder.completed_at).toLocaleDateString('en-SA'))
          ) : null,
        ),
        // Line items
        React.createElement(
          View,
          { style: { marginBottom: 8 } },
          React.createElement(Text, { style: styles.sectionTitle }, 'ITEMS'),
          React.createElement(View, { style: styles.tableHeader },
            React.createElement(Text, { style: [styles.tableCellBold, { flex: 3 }] }, 'Description'),
            React.createElement(Text, { style: [styles.tableCellBold, { flex: 1, textAlign: 'right' }] }, 'Qty'),
            React.createElement(Text, { style: [styles.tableCellBold, { flex: 1, textAlign: 'right' }] }, 'Unit'),
            React.createElement(Text, { style: [styles.tableCellBold, { flex: 1, textAlign: 'right' }] }, 'Amount'),
          ),
          React.createElement(View, { style: styles.tableRow },
            React.createElement(Text, { style: [styles.tableCell, { flex: 3 }] }, 'Maintenance Service — ' + (workOrder.title ?? '')),
            React.createElement(Text, { style: [styles.tableCell, { flex: 1, textAlign: 'right' }] }, '1'),
            React.createElement(Text, { style: [styles.tableCell, { flex: 1, textAlign: 'right' }] }, formatSAR(subtotal)),
            React.createElement(Text, { style: [styles.tableCell, { flex: 1, textAlign: 'right' }] }, formatSAR(subtotal)),
          ),
        ),
        // Totals
        React.createElement(
          View,
          { style: styles.totalsBox },
          React.createElement(View, { style: styles.totalLine },
            React.createElement(Text, { style: styles.label }, 'Subtotal (excl. VAT)'),
            React.createElement(Text, { style: styles.value }, formatSAR(subtotal)),
          ),
          React.createElement(View, { style: styles.totalLine },
            React.createElement(Text, { style: styles.label }, 'VAT (15%)'),
            React.createElement(Text, { style: styles.value }, formatSAR(vat)),
          ),
          React.createElement(View, { style: styles.grandTotal },
            React.createElement(Text, { style: styles.grandTotalLabel }, 'TOTAL (incl. VAT)'),
            React.createElement(Text, { style: styles.grandTotalValue }, formatSAR(total)),
          ),
        ),
        // ZATCA QR note
        React.createElement(
          View,
          { style: styles.qrSection },
          React.createElement(Text, { style: styles.qrLabel }, 'ZATCA Phase 2 — Scan to verify'),
          React.createElement(Text, { style: [styles.qrLabel, { marginTop: 8, fontSize: 8, color: '#4A5568' }] }, 'QR Data: ' + qrData.slice(0, 40) + '...'),
        ),
        // Footer
        React.createElement(
          View,
          { style: styles.footer },
          React.createElement(Text, { style: styles.footerText },
            (org.name ?? '') + ' · VAT ' + (org.vat_number ?? 'N/A') + ' · ' + (org.address ?? '') + ' · Generated by Serviq FM'
          ),
        ),
      )
    )

    const pdfBuffer = await renderToBuffer(pdfDoc)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoiceNumber}.pdf"`,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
