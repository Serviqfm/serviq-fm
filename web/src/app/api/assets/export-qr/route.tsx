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

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { assetIds, layout } = await req.json() as { assetIds: string[]; layout: 2 | 4 | 6 }

  const { data: assets } = await supabase
    .from('assets')
    .select('id, name, qr_code, category, site:site_id(name)')
    .in('id', assetIds)

  if (!assets?.length) {
    return NextResponse.json({ error: 'No assets found' }, { status: 400 })
  }

  const qrImages: { name: string; subtitle: string; category: string; dataUrl: string }[] = []
  for (const asset of assets as unknown as { id: string; name: string; qr_code: string | null; category: string | null; site: { name: string } | null }[]) {
    const url = `${APP_URL}/dashboard/assets/${asset.id}`
    const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 })
    qrImages.push({
      name: asset.name,
      subtitle: asset.qr_code ?? '',
      category: [asset.category, asset.site?.name].filter(Boolean).join(' · '),
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
          {qrImages.map((item, i) => (
            <View key={i} style={cardStyle(layout)}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={item.dataUrl} style={{ width: qrSz, height: qrSz, marginBottom: 6 }} />
              <Text style={{ fontSize: nmSz, fontWeight: 'bold', color: '#0F2044', textAlign: 'center', marginBottom: 2 }}>{item.name}</Text>
              {item.subtitle && <Text style={{ fontSize: sbSz, color: '#64748B', textAlign: 'center' }}>{item.subtitle}</Text>}
              {item.category && <Text style={{ fontSize: sbSz, color: '#64748B', textAlign: 'center' }}>{item.category}</Text>}
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
      'Content-Disposition': `attachment; filename="asset-qr-codes.pdf"`,
    },
  })
}
