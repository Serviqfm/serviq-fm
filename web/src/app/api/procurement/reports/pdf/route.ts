// web/src/app/api/procurement/reports/pdf/route.ts
// GET — the procurement summary as a PDF.
//
// The figures are recomputed HERE, server-side, from the same pure functions the
// page uses — the client never posts numbers in. A report is a document people
// forward to finance; it must not be forgeable by editing a request body.

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, Document, Page, Text, View } from '@react-pdf/renderer'
import React from 'react'
import { reportStyles as s } from '@/lib/pdf-report-styles'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'
import {
  spendByVendor, spendByCategory, cycleTime, vendorPerformance, poTotal, isCommitted,
  type PoForReport, type RequisitionForReport, type SpendRow,
} from '@/lib/procurementReports'

export const runtime = 'nodejs'
export const maxDuration = 60

const money = (n: number) =>
  n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function spendTable(title: string, rows: SpendRow[]) {
  return React.createElement(React.Fragment, null,
    React.createElement(Text, { style: s.sectionTitle }, title),
    React.createElement(View, { style: s.table },
      React.createElement(View, { style: s.tableHeaderRow },
        React.createElement(View, { style: { ...s.tableHeaderCell, width: '70%' } }, React.createElement(Text, null, 'Name')),
        React.createElement(View, { style: { ...s.tableHeaderCell, width: '30%' } }, React.createElement(Text, null, 'Total (SAR)')),
      ),
      ...(rows.length === 0
        ? [React.createElement(View, { style: s.tableRow, key: 'empty' },
            React.createElement(View, { style: { ...s.tableCell, width: '100%' } }, React.createElement(Text, null, 'No data.')))]
        : rows.slice(0, 12).map((r, i) =>
            React.createElement(View, { style: s.tableRow, key: i },
              React.createElement(View, { style: { ...s.tableCell, width: '70%' } }, React.createElement(Text, null, r.name)),
              React.createElement(View, { style: { ...s.tableCell, width: '30%' } }, React.createElement(Text, null, money(r.value))),
            ))),
    ),
  )
}

export async function GET(_req: NextRequest) {
  const caller = await resolveCaller(['admin', 'manager'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  const [poRes, reqRes, orgRes] = await Promise.all([
    admin.from('purchase_orders')
      .select('id, status, created_at, sent_at, received_at, expected_at, requisition_id, vendor:vendor_id(company_name), items:purchase_order_items(quantity, unit_cost, item:item_id(category))')
      .eq('organisation_id', orgId),
    admin.from('requisitions')
      .select('id, status, created_at, submitted_at, decided_at')
      .eq('organisation_id', orgId),
    admin.from('organisations').select('name').eq('id', orgId).maybeSingle(),
  ])

  if (poRes.error) {
    console.error('[procurement report pdf] purchase orders query failed', poRes.error)
    return NextResponse.json({ error: poRes.error.message }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pos: PoForReport[] = (poRes.data ?? []).map((p: any) => ({
    id: p.id,
    status: p.status,
    created_at: p.created_at,
    sent_at: p.sent_at,
    received_at: p.received_at,
    expected_at: p.expected_at,
    requisition_id: p.requisition_id,
    vendor_name: p.vendor?.company_name ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: (p.items ?? []).map((l: any) => ({
      quantity: l.quantity, unit_cost: l.unit_cost, category: l.item?.category ?? null,
    })),
  }))

  // A tenant without the P1 migration simply has no requisitions to cycle-time.
  const reqs: RequisitionForReport[] = reqRes.error ? [] : (reqRes.data ?? []).map(r => ({
    id: r.id as string,
    status: r.status as string,
    created_at: r.created_at as string,
    submitted_at: r.submitted_at as string | null,
    decided_at: r.decided_at as string | null,
  }))

  const orgName = orgRes.data?.name ?? 'ServIQ-FM'
  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const total = pos.filter(isCommitted).reduce((sum, p) => sum + poTotal(p), 0)
  const cycle = cycleTime(reqs, pos)
  const vendors = vendorPerformance(pos)

  const kpi = (label: string, value: string) =>
    React.createElement(View, { style: s.kpiCard, key: label },
      React.createElement(Text, { style: s.kpiLabel }, label),
      React.createElement(Text, { style: s.kpiValue }, value),
    )
  const days = (n: number | null) => (n === null ? '—' : `${n} d`)

  const doc = React.createElement(Document, null,
    React.createElement(Page, { size: 'A4', style: s.page },
      React.createElement(View, { style: s.header },
        React.createElement(View, null,
          React.createElement(Text, { style: s.brand }, 'ServIQ-FM'),
          React.createElement(Text, { style: s.brandSub }, 'Procurement Report'),
        ),
        React.createElement(View, null,
          React.createElement(Text, { style: s.reportTitle }, 'Spend & Performance'),
          React.createElement(Text, { style: s.reportMeta }, `${orgName} · ${generatedAt}`),
        ),
      ),

      React.createElement(View, { style: s.kpiGrid },
        kpi('Committed Spend', money(total)),
        kpi('Purchase Orders', String(pos.length)),
        kpi('Request → Approval', days(cycle.requestToApproval)),
        kpi('Order → Delivered', days(cycle.orderToDelivery)),
      ),

      spendTable('Spend by Vendor', spendByVendor(pos)),
      spendTable('Spend by Category', spendByCategory(pos)),

      React.createElement(Text, { style: s.sectionTitle }, 'Vendor Performance'),
      React.createElement(View, { style: s.table },
        React.createElement(View, { style: s.tableHeaderRow },
          React.createElement(View, { style: { ...s.tableHeaderCell, width: '40%' } }, React.createElement(Text, null, 'Vendor')),
          React.createElement(View, { style: { ...s.tableHeaderCell, width: '25%' } }, React.createElement(Text, null, 'Spend (SAR)')),
          React.createElement(View, { style: { ...s.tableHeaderCell, width: '15%' } }, React.createElement(Text, null, 'Open')),
          React.createElement(View, { style: { ...s.tableHeaderCell, width: '20%' } }, React.createElement(Text, null, 'On time')),
        ),
        ...(vendors.length === 0
          ? [React.createElement(View, { style: s.tableRow, key: 'none' },
              React.createElement(View, { style: { ...s.tableCell, width: '100%' } }, React.createElement(Text, null, 'No vendors yet.')))]
          : vendors.slice(0, 15).map((v, i) =>
              React.createElement(View, { style: s.tableRow, key: i },
                React.createElement(View, { style: { ...s.tableCell, width: '40%' } }, React.createElement(Text, null, v.vendor)),
                React.createElement(View, { style: { ...s.tableCell, width: '25%' } }, React.createElement(Text, null, money(v.spend))),
                React.createElement(View, { style: { ...s.tableCell, width: '15%' } }, React.createElement(Text, null, String(v.openPos))),
                React.createElement(View, { style: { ...s.tableCell, width: '20%' } },
                  React.createElement(Text, null, v.onTimePercent === null ? 'n/a' : `${v.onTimePercent}%`)),
              ))),
      ),

      React.createElement(View, { style: s.footer },
        React.createElement(Text, { style: s.footerText }, `Generated by ServIQ-FM · ${orgName} · ${generatedAt}`),
      ),
    ),
  )

  const buffer = await renderToBuffer(doc)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="procurement-report-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  })
}
