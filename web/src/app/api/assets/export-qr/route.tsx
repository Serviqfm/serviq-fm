import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { renderToBuffer, Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

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

// AL-10: fields the label sheet can print, mapped to a display line per asset.
type LabelAsset = {
  id: string; name: string; qr_code: string | null; category: string | null
  serial_number: string | null; manufacturer: string | null; model: string | null
  sub_location: string | null; site: { name: string } | null
}
const FIELD_ACCESSORS: Record<string, (a: LabelAsset) => string> = {
  qr_code:      a => a.qr_code ?? '',
  serial_number: a => a.serial_number ? 'SN: ' + a.serial_number : '',
  category:     a => a.category ?? '',
  site:         a => a.site?.name ?? '',
  manufacturer: a => a.manufacturer ?? '',
  model:        a => a.model ?? '',
  sub_location: a => a.sub_location ?? '',
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  // AL-10: `fields` (optional) chooses which lines print under the name. When
  // omitted, the original QR-code-number + category·site layout is used.
  const { assetIds, layout, fields } = await req.json() as { assetIds: string[]; layout: 2 | 4 | 6; fields?: string[] }
  const selectedFields = Array.isArray(fields) ? fields.filter(f => f in FIELD_ACCESSORS) : null

  const { data: assets } = await supabase
    .from('assets')
    .select('id, name, qr_code, category, serial_number, manufacturer, model, sub_location, site:site_id(name)')
    .in('id', assetIds)

  if (!assets?.length) {
    return NextResponse.json({ error: 'No assets found' }, { status: 400 })
  }

  const qrImages: { name: string; lines: string[]; dataUrl: string }[] = []
  for (const asset of assets as unknown as LabelAsset[]) {
    const url = `${APP_URL}/dashboard/assets/${asset.id}`
    const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 })
    const lines = selectedFields
      ? selectedFields.map(f => FIELD_ACCESSORS[f](asset)).filter(Boolean)
      : [asset.qr_code ?? '', [asset.category, asset.site?.name].filter(Boolean).join(' · ')].filter(Boolean)
    qrImages.push({ name: asset.name, lines, dataUrl })
  }

  const qrSz = qrSize(layout)
  const nmSz = nameSize(layout)
  const sbSz = subSize(layout)

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.grid}>
          {qrImages.map((item, i) => (
            <View key={i} style={cardStyle(layout)}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={item.dataUrl} style={{ width: qrSz, height: qrSz, marginBottom: 6 }} />
              <Text style={{ fontSize: nmSz, fontWeight: 'bold', color: '#0F2044', textAlign: 'center', marginBottom: 2 }}>{item.name}</Text>
              {item.lines.map((line, j) => (
                <Text key={j} style={{ fontSize: sbSz, color: '#64748B', textAlign: 'center' }}>{line}</Text>
              ))}
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
      'Content-Disposition': `attachment; filename="asset-labels.pdf"`,
    },
  })
}
