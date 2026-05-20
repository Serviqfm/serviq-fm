'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import QRCode from 'qrcode'
import { exportCSV, parseCSV, readFileText } from '@/lib/csv'

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

  const csvImportRef = useRef<HTMLInputElement>(null)
  function handleCsvExport() {
    exportCSV(`spaces-${site?.name ?? 'site'}-${new Date().toISOString().slice(0, 10)}.csv`, spaces.map(s => ({
      name: s.name ?? '', name_ar: s.name_ar ?? '', floor: s.floor ?? '', description: s.description ?? '',
    })))
  }
  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const rows = parseCSV(await readFileText(file))
      if (rows.length === 0) { alert('CSV had no data rows.'); return }
      const payload = rows.filter(r => r.name).map(r => ({
        site_id: params.id,
        name: r.name,
        name_ar: r.name_ar || null,
        floor: r.floor || 'Ground',
        description: r.description || null,
      }))
      if (payload.length === 0) { alert('No rows had a name to import.'); return }
      const { error } = await supabase.from('spaces').insert(payload)
      if (error) { alert('Import failed: ' + error.message); return }
      alert(`Imported ${payload.length} space(s).`)
      fetchData()
    } finally {
      if (csvImportRef.current) csvImportRef.current.value = ''
    }
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
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <p className="text-xs text-on-surface-variant mb-1">
              <Link href="/dashboard/sites" className="text-primary hover:underline">Sites</Link>
              {' / '}{site?.name || '...'}
            </p>
            <h1 className="text-3xl font-bold text-on-surface">Spaces</h1>
            <p className="text-sm text-on-surface-variant mt-1">{spaces.length} space{spaces.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-2.5">
            <button onClick={() => setShowExport(true)} className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">Export QR Codes</button>
            <input ref={csvImportRef} type="file" accept=".csv,text/csv" onChange={handleCsvImport} className="hidden" />
            <button onClick={() => csvImportRef.current?.click()} className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">Import CSV</button>
            <button onClick={handleCsvExport} className="bg-secondary/10 text-secondary px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-secondary/20 transition-colors">Export CSV</button>
            <Link href={`/dashboard/sites/${params.id}/spaces/new`}>
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">Add Space +</button>
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="text-on-surface-variant">Loading...</p>
        ) : spaces.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant">
            <p className="text-lg">No spaces yet. Add your first space to generate QR codes.</p>
          </div>
        ) : (
          floors.map(floor => (
            <div key={floor} className="mb-7">
              <div className="flex items-center gap-2.5 mb-3">
                <h2 className="text-sm font-bold text-on-surface">{floor}</h2>
                <span className="text-xs text-on-surface-variant">
                  {spaces.filter(s => s.floor === floor).length} space{spaces.filter(s => s.floor === floor).length !== 1 ? 's' : ''}
                </span>
                <div className="flex-1 h-px bg-outline-variant" />
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
                {spaces.filter(s => s.floor === floor).map(space => (
                  <div key={space.id} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-4">
                    <h3 className="text-[15px] font-semibold text-on-surface mb-0.5">{space.name}</h3>
                    {space.name_ar && <p className="text-[13px] text-on-surface-variant mb-1 text-right" dir="rtl">{space.name_ar}</p>}
                    {space.description && <p className="text-xs text-outline mb-2 leading-relaxed">{space.description}</p>}
                    <div className="flex gap-2 mt-3">
                      <Link href={`/dashboard/sites/${params.id}/spaces/${space.id}/edit`}>
                        <button className="border border-outline-variant text-on-surface-variant px-3 py-1 rounded-xl text-xs font-semibold hover:bg-surface-container-low transition-colors">Edit</button>
                      </Link>
                      <button onClick={() => openQr(space)} className="border border-outline-variant text-on-surface-variant px-3 py-1 rounded-xl text-xs font-semibold hover:bg-surface-container-low transition-colors">QR Code</button>
                      <button onClick={() => deleteSpace(space.id)} className="text-error border border-error/20 bg-error/10 px-3 py-1 rounded-xl text-xs font-semibold hover:bg-error/20 transition-colors">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* QR Modal */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[16px] shadow-sm p-8 max-w-[360px] w-full text-center">
            <h3 className="text-lg font-bold text-on-surface mb-1">{qrModal.name}</h3>
            <p className="text-sm text-on-surface-variant mb-5">{qrModal.floor} · {site?.name}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="w-[200px] h-[200px] mx-auto mb-5 block" />}
            <div className="flex gap-2.5 justify-center">
              <a href={qrDataUrl} download={`qr-${qrModal.name}.png`}>
                <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">Download PNG</button>
              </a>
              <button onClick={() => {
                const w = window.open('')
                if (w) { w.document.write(`<img src="${qrDataUrl}" style="width:300px"><br><p>${qrModal.name}</p>`); w.print() }
              }} className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">Print</button>
            </div>
            <button onClick={() => { setQrModal(null); setQrDataUrl('') }} className="mt-4 bg-transparent border-none text-on-surface-variant cursor-pointer text-sm hover:text-on-surface transition-colors">Close</button>
          </div>
        </div>
      )}

      {/* Bulk Export Modal */}
      {showExport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[16px] shadow-sm p-8 max-w-[420px] w-full">
            <h3 className="text-lg font-bold text-on-surface mb-5">Export QR Codes as PDF</h3>
            <div className="mb-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Floor Filter</label>
              <select value={exportFloor} onChange={e => setExportFloor(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all">
                <option value="all">All Floors</option>
                {floors.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="mb-6">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-2">Layout (per A4 page)</label>
              <div className="flex gap-4">
                {([2, 4, 6] as const).map(n => (
                  <label key={n} className="flex items-center gap-1.5 cursor-pointer text-sm text-on-surface">
                    <input type="radio" checked={exportLayout === n} onChange={() => setExportLayout(n)} />
                    {n} per page
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2.5">
              <button onClick={handleExportPdf} disabled={exporting}
                className="flex-1 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-70">
                {exporting ? 'Generating...' : 'Generate PDF'}
              </button>
              <button onClick={() => setShowExport(false)} className="flex-1 border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
