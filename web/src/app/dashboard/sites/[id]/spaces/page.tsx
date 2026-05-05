'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { C, F, pageStyle, primaryBtn, secondaryBtn, dangerBtn } from '@/lib/brand'
import QRCode from 'qrcode'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'

export default function SpacesPage({ params }: { params: { id: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [site, setSite] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spaces, setSpaces] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [qrModal, setQrModal] = useState<any>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [showExport, setShowExport] = useState(false)
  const [exportFloor, setExportFloor] = useState('all')
  const [exportLayout, setExportLayout] = useState<2|4|6>(4)
  const [exporting, setExporting] = useState(false)
  const supabase = createClient()

  useEffect(() => { fetchData() }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true)
    const { data: siteData } = await supabase.from('sites').select('*').eq('id', params.id).single()
    if (siteData) setSite(siteData)
    const { data } = await supabase.from('spaces').select('*').eq('site_id', params.id).order('floor').order('name')
    if (data) setSpaces(data)
    setLoading(false)
  }

  async function deleteSpace(id: string) {
    if (!confirm('Delete this space? This cannot be undone.')) return
    await supabase.from('spaces').delete().eq('id', id)
    fetchData()
  }

  async function openQr(space: { qr_token: string; name: string; floor: string }) {
    setQrModal(space)
    const url = `${APP_URL}/r/${space.qr_token}`
    const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 2 })
    setQrDataUrl(dataUrl)
  }

  async function handleExportPdf() {
    setExporting(true)
    const filtered = exportFloor === 'all' ? spaces : spaces.filter(s => s.floor === exportFloor)
    const res = await fetch('/api/spaces/export-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceIds: filtered.map(s => s.id), layout: exportLayout, siteName: site?.name }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-codes-${site?.name || 'spaces'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    }
    setExporting(false)
    setShowExport(false)
  }

  const floors = Array.from(new Set(spaces.map(s => s.floor as string)))

  return (
    <div style={{ ...pageStyle, maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 4px' }}>
            <Link href="/dashboard/sites" style={{ color: C.blue, textDecoration: 'none' }}>Sites</Link>
            {' / '}{site?.name || '...'}
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 4px' }}>Spaces</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: 0 }}>{spaces.length} space{spaces.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowExport(true)} style={{ ...secondaryBtn, fontSize: 13 }}>Export QR Codes</button>
          <Link href={`/dashboard/sites/${params.id}/spaces/new`}>
            <button style={{ ...primaryBtn, fontSize: 13 }}>Add Space +</button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>Loading...</p>
      ) : spaces.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.textLight, fontFamily: F.en }}>
          <p style={{ fontSize: 18 }}>No spaces yet. Add your first space to generate QR codes.</p>
        </div>
      ) : (
        floors.map(floor => (
          <div key={floor} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{floor}</h2>
              <span style={{ fontSize: 12, color: C.textLight, fontFamily: F.en }}>
                {spaces.filter(s => s.floor === floor).length} space{spaces.filter(s => s.floor === floor).length !== 1 ? 's' : ''}
              </span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {spaces.filter(s => s.floor === floor).map(space => (
                <div key={space.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 2px', color: C.textDark, fontFamily: F.en }}>{space.name}</h3>
                  {space.name_ar && <p style={{ fontSize: 13, color: C.textMid, margin: '0 0 4px', direction: 'rtl', fontFamily: F.ar }}>{space.name_ar}</p>}
                  {space.description && <p style={{ fontSize: 12, color: C.textLight, margin: '0 0 8px', fontFamily: F.en, lineHeight: 1.5 }}>{space.description}</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <Link href={`/dashboard/sites/${params.id}/spaces/${space.id}/edit`}>
                      <button style={{ ...secondaryBtn, padding: '5px 12px', fontSize: 12 }}>Edit</button>
                    </Link>
                    <button onClick={() => openQr(space)} style={{ ...secondaryBtn, padding: '5px 12px', fontSize: 12 }}>QR Code</button>
                    <button onClick={() => deleteSpace(space.id)} style={{ ...dangerBtn, padding: '5px 12px', fontSize: 12 }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* QR Modal */}
      {qrModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: 32, maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, margin: '0 0 4px', fontFamily: F.en }}>{qrModal.name}</h3>
            <p style={{ fontSize: 13, color: C.textLight, margin: '0 0 20px', fontFamily: F.en }}>{qrModal.floor} · {site?.name}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qrDataUrl && <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200, margin: '0 auto 20px', display: 'block' }} />}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <a href={qrDataUrl} download={`qr-${qrModal.name}.png`}>
                <button style={{ ...primaryBtn, fontSize: 13 }}>Download PNG</button>
              </a>
              <button onClick={() => {
                const w = window.open('')
                if (w) { w.document.write(`<img src="${qrDataUrl}" style="width:300px"><br><p>${qrModal.name}</p>`); w.print() }
              }} style={{ ...secondaryBtn, fontSize: 13 }}>Print</button>
            </div>
            <button onClick={() => { setQrModal(null); setQrDataUrl('') }} style={{ marginTop: 16, background: 'none', border: 'none', color: C.textLight, cursor: 'pointer', fontFamily: F.en, fontSize: 13 }}>Close</button>
          </div>
        </div>
      )}

      {/* Bulk Export Modal */}
      {showExport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: 32, maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, margin: '0 0 20px', fontFamily: F.en }}>Export QR Codes as PDF</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Floor Filter</label>
              <select value={exportFloor} onChange={e => setExportFloor(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: F.en, color: C.textDark, background: C.white }}>
                <option value="all">All Floors</option>
                {floors.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 8, fontFamily: F.en }}>Layout (per A4 page)</label>
              <div style={{ display: 'flex', gap: 16 }}>
                {([2, 4, 6] as const).map(n => (
                  <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, fontFamily: F.en, color: C.textDark }}>
                    <input type="radio" checked={exportLayout === n} onChange={() => setExportLayout(n)} />
                    {n} per page
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleExportPdf} disabled={exporting} style={{ ...primaryBtn, flex: 1 }}>
                {exporting ? 'Generating...' : 'Generate PDF'}
              </button>
              <button onClick={() => setShowExport(false)} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
