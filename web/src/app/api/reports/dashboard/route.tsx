import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { renderToBuffer, Document, Page, Text, View } from '@react-pdf/renderer'
import { reportStyles as s } from '@/lib/pdf-report-styles'
import React from 'react'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('organisation_id, organisation:organisation_id(name)').eq('id', user.id).single() as { data: { organisation_id: string; organisation: { name: string } | null } | null }
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  const orgId = profile.organisation_id
  const orgName = profile.organisation?.name ?? 'Organisation'
  const now = new Date()

  const [{ data: wos }, { data: pms }, { data: assets }, { data: sites }] = await Promise.all([
    supabase.from('work_orders').select('status, priority, due_at, completed_at').eq('organisation_id', orgId),
    supabase.from('pm_schedules').select('is_active, next_due_at, last_completed_at').eq('organisation_id', orgId),
    supabase.from('assets').select('status, category').eq('organisation_id', orgId),
    supabase.from('sites').select('id').eq('organisation_id', orgId),
  ])

  const openWOs = (wos ?? []).filter(w => !['completed', 'closed'].includes(w.status))
  const overdueWOs = openWOs.filter(w => w.due_at && new Date(w.due_at) < now)
  const activePMs = (pms ?? []).filter(p => p.is_active)
  const completedPMs = activePMs.filter(p => p.last_completed_at)
  const pmCompliance = activePMs.length > 0 ? Math.round((completedPMs.length / activePMs.length) * 1000) / 10 : 0

  const woByStatus: Record<string, number> = {}
  openWOs.forEach(w => { woByStatus[w.status] = (woByStatus[w.status] ?? 0) + 1 })
  const woByPriority: Record<string, number> = {}
  openWOs.forEach(w => { woByPriority[w.priority] = (woByPriority[w.priority] ?? 0) + 1 })

  const generatedAt = now.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>ServIQ-FM</Text>
            <Text style={s.brandSub}>Facility Operations Report</Text>
          </View>
          <View>
            <Text style={s.reportTitle}>Dashboard Overview</Text>
            <Text style={s.reportMeta}>{orgName} · {generatedAt}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Key Performance Indicators</Text>
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}><Text style={s.kpiLabel}>Open WOs</Text><Text style={s.kpiValue}>{openWOs.length}</Text></View>
          <View style={s.kpiCard}><Text style={s.kpiLabel}>Overdue</Text><Text style={s.kpiValue}>{overdueWOs.length}</Text></View>
          <View style={s.kpiCard}><Text style={s.kpiLabel}>Active PMs</Text><Text style={s.kpiValue}>{activePMs.length}</Text></View>
          <View style={s.kpiCard}><Text style={s.kpiLabel}>PM Compliance</Text><Text style={s.kpiValue}>{pmCompliance}%</Text></View>
        </View>
        <View style={s.kpiGrid}>
          <View style={s.kpiCard}><Text style={s.kpiLabel}>Total WOs</Text><Text style={s.kpiValue}>{wos?.length ?? 0}</Text></View>
          <View style={s.kpiCard}><Text style={s.kpiLabel}>Total Assets</Text><Text style={s.kpiValue}>{assets?.length ?? 0}</Text></View>
          <View style={s.kpiCard}><Text style={s.kpiLabel}>Sites</Text><Text style={s.kpiValue}>{sites?.length ?? 0}</Text></View>
          <View style={s.kpiCard}><Text style={s.kpiLabel}>Completed PMs</Text><Text style={s.kpiValue}>{completedPMs.length}</Text></View>
        </View>

        <Text style={s.sectionTitle}>Open Work Orders by Status</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <View style={{ ...s.tableHeaderCell, width: '70%' }}><Text>Status</Text></View>
            <View style={{ ...s.tableHeaderCell, width: '30%' }}><Text>Count</Text></View>
          </View>
          {Object.entries(woByStatus).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
            <View key={status} style={s.tableRow}>
              <View style={{ ...s.tableCell, width: '70%' }}><Text>{status.replace(/_/g, ' ')}</Text></View>
              <View style={{ ...s.tableCell, width: '30%' }}><Text>{count}</Text></View>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Open Work Orders by Priority</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <View style={{ ...s.tableHeaderCell, width: '70%' }}><Text>Priority</Text></View>
            <View style={{ ...s.tableHeaderCell, width: '30%' }}><Text>Count</Text></View>
          </View>
          {Object.entries(woByPriority).sort((a, b) => b[1] - a[1]).map(([p, count]) => (
            <View key={p} style={s.tableRow}>
              <View style={{ ...s.tableCell, width: '70%' }}><Text>{p}</Text></View>
              <View style={{ ...s.tableCell, width: '30%' }}><Text>{count}</Text></View>
            </View>
          ))}
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
      'Content-Disposition': `attachment; filename="dashboard-${now.toISOString().slice(0, 10)}.pdf"`,
    },
  })
}
