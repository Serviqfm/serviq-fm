// AG-6 — Bulk QR label PDF for selected Asset Log items. Cloned from
// api/spaces/export-qr/route.tsx. Each QR encodes ${APP_URL}/al/{qr_token};
// label lines: name, AL-number, type, current space. Org-scoped: items are
// resolved through resolveCaller's service-role client but filtered to the
// caller's org, so one org cannot render another org's tokens.

import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { renderToBuffer, Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import { resolveCaller } from '../_helpers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'

const styles = StyleSheet.create({
  page: { padding: 24, backgroundColor: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
})

function cardStyle(layout: number) {
  const w = layout === 2 ? '46%' : layout === 4 ? '22%' : '14%'
  return { width: w, border: '1pt solid #E2E8F0', borderRadius: 6, padding: layout === 2 ? 16 : 8, alignItems: 'center' as const, marginBottom: 12 }
}
function qrSize(layout: number) { return layout === 2 ? 140 : layout === 4 ? 90 : 60 }
function nameSize(layout: number) { return layout === 2 ? 13 : layout === 4 ? 9 : 7 }
function subSize(layout: number) { return layout === 2 ? 10 : layout === 4 ? 7 : 6 }

const al = (n: number) => 'AL-' + String(n).padStart(4, '0')

export async function POST(req: NextRequest) {
  const ctx = await resolveCaller(['admin', 'manager', 'technician'])
  if (ctx instanceof NextResponse) return ctx

  const { itemIds, layout = 4 } = await req.json() as { itemIds: string[]; layout?: 2 | 4 | 6 }
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    return NextResponse.json({ error: 'No items selected' }, { status: 400 })
  }

  const { data: items } = await ctx.admin
    .from('asset_log_items')
    .select('id, name, item_number, qr_token, type:type_id(name), space:space_id(name)')
    .in('id', itemIds)
    .eq('organisation_id', ctx.orgId)

  if (!items?.length) {
    return NextResponse.json({ error: 'No items found' }, { status: 400 })
  }

  const cards: { name: string; sub1: string; sub2: string; dataUrl: string }[] = []
  for (const it of items) {
    const url = `${APP_URL}/al/${it.qr_token}`
    const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 })
    // Supabase typegen infers embedded 1:1 relations as arrays; normalise.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typeName = (Array.isArray(it.type) ? it.type[0] : it.type as any)?.name ?? ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spaceName = (Array.isArray(it.space) ? it.space[0] : it.space as any)?.name ?? ''
    cards.push({
      name: it.name,
      sub1: `${al(it.item_number)}${typeName ? ' · ' + typeName : ''}`,
      sub2: spaceName,
      dataUrl,
    })
  }

  const qrSz = qrSize(layout)
  const nmSz = nameSize(layout)
  const sbSz = subSize(layout)

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.grid}>
          {cards.map((item, i) => (
            <View key={i} style={cardStyle(layout)}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={item.dataUrl} style={{ width: qrSz, height: qrSz, marginBottom: 6 }} />
              <Text style={{ fontSize: nmSz, fontWeight: 'bold', color: '#0F2044', textAlign: 'center', marginBottom: 2 }}>{item.name}</Text>
              <Text style={{ fontSize: sbSz, color: '#64748B', textAlign: 'center' }}>{item.sub1}</Text>
              {item.sub2 ? <Text style={{ fontSize: sbSz, color: '#64748B', textAlign: 'center' }}>{item.sub2}</Text> : null}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )

  const buffer = await renderToBuffer(doc)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="asset-log-qr.pdf"`,
    },
  })
}
