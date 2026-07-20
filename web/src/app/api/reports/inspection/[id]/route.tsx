import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { renderToBuffer, Document, Page, Text, View } from '@react-pdf/renderer'
import { reportStyles as s } from '@/lib/pdf-report-styles'
import React from 'react'

export const runtime = 'nodejs'

type InspectionResponse = { item_id?: string; question?: string; label?: string; value?: string; notes?: string; result?: string | null; min?: number | null; max?: number | null }

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('organisation_id, organisation:organisation_id(name)').eq('id', user.id).single() as { data: { organisation_id: string; organisation: { name: string } | null } | null }
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  const { data: insp } = await supabase
    .from('inspection_results')
    .select('*, template:template_id(name, vertical, items), conductor:conducted_by(full_name, email), site:site_id(name, city), asset:asset_id(name, qr_code)')
    .eq('id', params.id)
    .eq('organisation_id', profile.organisation_id)
    .single() as { data: Record<string, unknown> & { template?: { name?: string; vertical?: string; items?: unknown[] } | null; conductor?: { full_name?: string; email?: string } | null; site?: { name?: string; city?: string } | null; asset?: { name?: string; qr_code?: string } | null } | null }

  if (!insp) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })

  const orgName = profile.organisation?.name ?? 'Organisation'
  const generatedAt = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const responses = ((insp.responses ?? []) as InspectionResponse[])

  const resultColor: Record<string, string> = { pass: '#006b54', fail: '#ba1a1a', partial: '#f57f17' }
  const resultLabel: Record<string, string> = { pass: 'Overall Pass', fail: 'Overall Fail', partial: 'Partial Pass' }
  const overall = String(insp.overall_result ?? '')
  const overallColor = resultColor[overall] ?? '#006b54'
  const overallLabel = resultLabel[overall] ?? '—'

  // CORE-27: numeric items carry a computed result ('fail' when out of range).
  const passes = responses.filter(r => r.value === 'pass' || r.result === 'pass').length
  const fails = responses.filter(r => r.value === 'fail' || r.result === 'fail').length

  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.brand}>ServIQ-FM</Text>
            <Text style={s.brandSub}>Inspection Report</Text>
          </View>
          <View>
            <Text style={s.reportTitle}>{insp.template?.name ?? 'Inspection'}</Text>
            <Text style={s.reportMeta}>{orgName} · {generatedAt}</Text>
          </View>
        </View>

        <View style={{ ...s.badge, backgroundColor: overallColor }}><Text>{overallLabel}</Text></View>

        <View style={s.detailRow}><Text style={s.detailLabel}>Template</Text><Text style={s.detailValue}>{insp.template?.name ?? '—'}{insp.template?.vertical ? ` (${insp.template.vertical})` : ''}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Conducted By</Text><Text style={s.detailValue}>{insp.conductor?.full_name ?? insp.conductor?.email ?? '—'}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Site</Text><Text style={s.detailValue}>{[insp.site?.name, insp.site?.city].filter(Boolean).join(' — ') || '—'}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Asset</Text><Text style={s.detailValue}>{insp.asset?.name ?? '—'}{insp.asset?.qr_code ? ` (${insp.asset.qr_code})` : ''}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Conducted At</Text><Text style={s.detailValue}>{insp.created_at ? new Date(String(insp.created_at)).toLocaleString('en-GB') : '—'}</Text></View>
        <View style={s.detailRow}><Text style={s.detailLabel}>Pass / Fail</Text><Text style={s.detailValue}>{passes} pass · {fails} fail · {responses.length} total</Text></View>

        {Boolean(insp.notes) && (
          <>
            <Text style={s.sectionTitle}>Notes</Text>
            <Text style={s.paragraph}>{String(insp.notes)}</Text>
          </>
        )}

        <Text style={s.sectionTitle}>Checklist Responses</Text>
        <View style={s.table}>
          <View style={s.tableHeaderRow}>
            <View style={{ ...s.tableHeaderCell, width: '60%' }}><Text>Question</Text></View>
            <View style={{ ...s.tableHeaderCell, width: '15%' }}><Text>Result</Text></View>
            <View style={{ ...s.tableHeaderCell, width: '25%' }}><Text>Notes</Text></View>
          </View>
          {responses.length === 0 ? (
            <View style={s.tableRow}><View style={{ ...s.tableCell, width: '100%' }}><Text>No responses recorded.</Text></View></View>
          ) : (
            responses.map((r, i) => (
              <View key={i} style={s.tableRow}>
                <View style={{ ...s.tableCell, width: '60%' }}><Text>{r.question ?? r.label ?? r.item_id ?? '—'}{r.min != null || r.max != null ? ` (range ${r.min ?? '−∞'}–${r.max ?? '∞'})` : ''}</Text></View>
                <View style={{ ...s.tableCell, width: '15%', color: resultColor[r.result ?? r.value ?? ''] ?? '#1E2D4E' }}><Text>{r.value ?? '—'}</Text></View>
                <View style={{ ...s.tableCell, width: '25%' }}><Text>{r.notes ?? ''}</Text></View>
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
      'Content-Disposition': `attachment; filename="inspection-${params.id}.pdf"`,
    },
  })
}
