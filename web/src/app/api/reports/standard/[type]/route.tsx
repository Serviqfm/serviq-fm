import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { renderToBuffer, Document, Page, Text, View } from '@react-pdf/renderer'
import { reportStyles as s } from '@/lib/pdf-report-styles'
import React from 'react'

export const runtime = 'nodejs'

type ReportType = 'asset-health' | 'technician-performance' | 'pm-compliance' | 'work-orders'

const REPORT_TITLES: Record<ReportType, string> = {
  'asset-health': 'Monthly Asset Health',
  'technician-performance': 'Technician Performance',
  'pm-compliance': 'PM Compliance',
  'work-orders': 'Work Order Register',
}

export async function GET(_req: NextRequest, { params }: { params: { type: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('organisation_id, organisation:organisation_id(name)').eq('id', user.id).single() as { data: { organisation_id: string; organisation: { name: string } | null } | null }
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  const type = params.type as ReportType
  if (!REPORT_TITLES[type]) return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })

  const orgId = profile.organisation_id
  const orgName = profile.organisation?.name ?? 'Organisation'
  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  let cols: string[] = []
  let rows: Record<string, unknown>[] = []
  let widths: string[] = []

  if (type === 'asset-health') {
    const { data } = await supabase.from('assets').select('name, category, status, criticality, purchase_date, last_pm_at').eq('organisation_id', orgId)
    cols = ['Name', 'Category', 'Status', 'Criticality', 'Purchased', 'Last PM']
    widths = ['28%', '14%', '14%', '14%', '15%', '15%']
    rows = (data ?? []).map(a => ({
      'Name': a.name ?? '',
      'Category': a.category ?? '',
      'Status': a.status ?? '',
      'Criticality': a.criticality ?? '',
      'Purchased': a.purchase_date ? new Date(a.purchase_date).toLocaleDateString('en-GB') : '',
      'Last PM': a.last_pm_at ? new Date(a.last_pm_at).toLocaleDateString('en-GB') : '',
    }))
  } else if (type === 'technician-performance') {
    const { data } = await supabase.from('work_orders').select('wo_number, status, priority, assignee:assigned_to(full_name), created_at, completed_at').eq('organisation_id', orgId) as { data: { wo_number?: string; status?: string; priority?: string; assignee?: { full_name?: string } | null; created_at?: string; completed_at?: string }[] | null }
    cols = ['WO #', 'Technician', 'Status', 'Priority', 'Opened', 'Closed']
    widths = ['12%', '24%', '14%', '12%', '19%', '19%']
    rows = (data ?? []).map(w => ({
      'WO #': w.wo_number ?? '',
      'Technician': w.assignee?.full_name ?? '—',
      'Status': w.status ?? '',
      'Priority': w.priority ?? '',
      'Opened': w.created_at ? new Date(w.created_at).toLocaleDateString('en-GB') : '',
      'Closed': w.completed_at ? new Date(w.completed_at).toLocaleDateString('en-GB') : '',
    }))
  } else if (type === 'pm-compliance') {
    const { data } = await supabase.from('pm_schedules').select('title, frequency, next_due_at, last_completed_at, is_active').eq('organisation_id', orgId)
    cols = ['Title', 'Frequency', 'Active', 'Next Due', 'Last Done']
    widths = ['34%', '14%', '12%', '20%', '20%']
    rows = (data ?? []).map(p => ({
      'Title': p.title ?? '',
      'Frequency': p.frequency ?? '',
      'Active': p.is_active ? 'Yes' : 'No',
      'Next Due': p.next_due_at ? new Date(p.next_due_at).toLocaleDateString('en-GB') : '',
      'Last Done': p.last_completed_at ? new Date(p.last_completed_at).toLocaleDateString('en-GB') : '',
    }))
  } else if (type === 'work-orders') {
    const { data } = await supabase
      .from('work_orders')
      .select('wo_number, title, status, priority, asset:asset_id(name), site:site_id(name), assignee:assigned_to(full_name), created_at')
      .eq('organisation_id', orgId)
      .order('created_at', { ascending: false }) as { data: { wo_number?: string; title?: string; status?: string; priority?: string; asset?: { name?: string } | null; site?: { name?: string } | null; assignee?: { full_name?: string } | null; created_at?: string }[] | null }
    cols = ['WO #', 'Title', 'Asset', 'Site', 'Status', 'Priority', 'Created']
    widths = ['10%', '24%', '16%', '14%', '12%', '10%', '14%']
    rows = (data ?? []).map(w => ({
      'WO #': w.wo_number ?? '',
      'Title': w.title ?? '',
      'Asset': w.asset?.name ?? '',
      'Site': w.site?.name ?? '',
      'Status': w.status ?? '',
      'Priority': w.priority ?? '',
      'Created': w.created_at ? new Date(w.created_at).toLocaleDateString('en-GB') : '',
    }))
  }

  const title = REPORT_TITLES[type]
  const doc = (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>ServIQ-FM</Text>
            <Text style={s.brandSub}>{title}</Text>
          </View>
          <View>
            <Text style={s.reportTitle}>{rows.length} record{rows.length === 1 ? '' : 's'}</Text>
            <Text style={s.reportMeta}>{orgName} · {generatedAt}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            {cols.map((c, i) => (
              <View key={c} style={{ ...s.tableHeaderCell, width: widths[i] }}><Text>{c}</Text></View>
            ))}
          </View>
          {rows.length === 0 ? (
            <View style={s.tableRow}><View style={{ ...s.tableCell, width: '100%' }}><Text>No data.</Text></View></View>
          ) : (
            rows.map((r, ri) => (
              <View key={ri} style={s.tableRow}>
                {cols.map((c, i) => (
                  <View key={c} style={{ ...s.tableCell, width: widths[i] }}><Text>{String(r[c] ?? '')}</Text></View>
                ))}
              </View>
            ))
          )}
        </View>

        <View style={s.footer}>
          <Text style={s.footerText}>Generated by ServIQ-FM · {orgName} · {generatedAt}</Text>
        </View>
      </Page>
    </Document>
  )

  const buffer = await renderToBuffer(doc)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  })
}
