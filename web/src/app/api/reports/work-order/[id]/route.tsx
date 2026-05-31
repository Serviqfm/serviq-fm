import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { renderToBuffer, Document, Page, Text, View } from '@react-pdf/renderer'
import { reportStyles as s } from '@/lib/pdf-report-styles'
import React from 'react'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('organisation_id, organisation:organisation_id(name)').eq('id', user.id).single() as { data: { organisation_id: string; organisation: { name: string } | null } | null }
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  const { data: wo } = await supabase
    .from('work_orders')
    .select('*, asset:asset_id(name, qr_code), site:site_id(name, city), space:space_id(name, floor), assignee:assigned_to(full_name, email)')
    .eq('id', params.id)
    .eq('organisation_id', profile.organisation_id)
    .single() as { data: Record<string, unknown> & { asset?: { name?: string; qr_code?: string } | null; site?: { name?: string; city?: string } | null; space?: { name?: string; floor?: string } | null; assignee?: { full_name?: string; email?: string } | null } | null }

  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const { data: comments } = await supabase
    .from('audit_logs')
    .select('action, details, created_at')
    .eq('entity_id', params.id)
    .eq('entity_type', 'work_order')
    .order('created_at', { ascending: true })
    .limit(50)

  const orgName = profile.organisation?.name ?? 'Organisation'
  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const woNumber = (wo.wo_number as string) ?? params.id.slice(0, 8)
  const title = (wo.title as string) ?? '(no title)'

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>ServIQ-FM</Text>
            <Text style={s.brandSub}>Work Order Report</Text>
          </View>
          <View>
            <Text style={s.reportTitle}>WO-{woNumber}</Text>
            <Text style={s.reportMeta}>{orgName} · {generatedAt}</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>{title}</Text>

        <View style={s.detailRow}><Text style={s.detailLabel}>Status</Text><Text style={s.detailValue}>{String(wo.status ?? '—')}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Priority</Text><Text style={s.detailValue}>{String(wo.priority ?? '—')}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Category</Text><Text style={s.detailValue}>{String(wo.category ?? '—')}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Asset</Text><Text style={s.detailValue}>{wo.asset?.name ?? '—'}{wo.asset?.qr_code ? ` (${wo.asset.qr_code})` : ''}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Site</Text><Text style={s.detailValue}>{[wo.site?.name, wo.site?.city].filter(Boolean).join(' — ') || '—'}</Text></View>
        {wo.space?.name && <View style={s.detailRow}><Text style={s.detailLabel}>Space</Text><Text style={s.detailValue}>{wo.space.name}{wo.space.floor ? ` (${wo.space.floor})` : ''}</Text></View>}
        <View style={s.detailRow}><Text style={s.detailLabel}>Assigned To</Text><Text style={s.detailValue}>{wo.assignee?.full_name ?? wo.assignee?.email ?? 'Unassigned'}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Created</Text><Text style={s.detailValue}>{wo.created_at ? new Date(String(wo.created_at)).toLocaleString('en-GB') : '—'}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Due</Text><Text style={s.detailValue}>{wo.due_at ? new Date(String(wo.due_at)).toLocaleString('en-GB') : '—'}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Started</Text><Text style={s.detailValue}>{wo.started_at ? new Date(String(wo.started_at)).toLocaleString('en-GB') : '—'}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Completed</Text><Text style={s.detailValue}>{wo.completed_at ? new Date(String(wo.completed_at)).toLocaleString('en-GB') : '—'}</Text></View>

        <Text style={s.sectionTitle}>Description</Text>
        <Text style={s.paragraph}>{String(wo.description ?? '—')}</Text>

        {Boolean(wo.completion_notes) && (
          <>
            <Text style={s.sectionTitle}>Completion Notes</Text>
            <Text style={s.paragraph}>{String(wo.completion_notes)}</Text>
          </>
        )}

        <Text style={s.sectionTitle}>History</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <View style={{ ...s.tableHeaderCell, width: '35%' }}><Text>Timestamp</Text></View>
            <View style={{ ...s.tableHeaderCell, width: '65%' }}><Text>Action</Text></View>
          </View>
          {(comments ?? []).length === 0 ? (
            <View style={s.tableRow}><View style={{ ...s.tableCell, width: '100%' }}><Text>No history yet.</Text></View></View>
          ) : (
            (comments ?? []).map((c, i) => (
              <View key={i} style={s.tableRow}>
                <View style={{ ...s.tableCell, width: '35%' }}><Text>{new Date(c.created_at).toLocaleString('en-GB')}</Text></View>
                <View style={{ ...s.tableCell, width: '65%' }}><Text>{c.action}</Text></View>
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
      'Content-Disposition': `attachment; filename="WO-${woNumber}.pdf"`,
    },
  })
}
