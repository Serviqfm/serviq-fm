'use client'

// AL-10 — Configurable asset label-sheet export. Renders a small popover to pick
// which fields print on each label + the per-page layout, then downloads a PDF
// from /api/assets/export-qr (which accepts an optional `fields` array).

import { useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'

const FIELDS: { key: string; en: string; ar: string }[] = [
  { key: 'qr_code',      en: 'Barcode / QR no.', ar: 'رقم الباركود' },
  { key: 'serial_number', en: 'Serial number',   ar: 'الرقم التسلسلي' },
  { key: 'category',     en: 'Category',          ar: 'الفئة' },
  { key: 'site',         en: 'Site',              ar: 'الموقع' },
  { key: 'manufacturer', en: 'Manufacturer',      ar: 'الصانع' },
  { key: 'model',        en: 'Model',             ar: 'الطراز' },
  { key: 'sub_location', en: 'Sub-location',      ar: 'الموقع الفرعي' },
]

export default function AssetLabelExport({ assetIds }: { assetIds: string[] }) {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [layout, setLayout] = useState<2 | 4 | 6>(4)
  const [fields, setFields] = useState<string[]>(['qr_code', 'category', 'site'])

  const toggle = (key: string) => setFields(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  async function exportLabels() {
    if (assetIds.length === 0) return
    setBusy(true)
    try {
      const res = await fetch('/api/assets/export-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds, layout, fields }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('Label export failed: ' + (err.error ?? res.statusText))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `asset-labels-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen(o => !o)}
        className="px-4 py-1.5 rounded-xl bg-secondary/10 text-secondary text-sm font-semibold hover:bg-secondary/20 transition-colors">
        {ar ? 'أوراق الملصقات' : 'Label sheet'}
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-64 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xl p-4 start-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">{ar ? 'الحقول' : 'Fields'}</p>
          <div className="flex flex-col gap-1.5 mb-3">
            {FIELDS.map(f => (
              <label key={f.key} className="flex items-center gap-2 cursor-pointer text-sm text-on-surface">
                <input type="checkbox" checked={fields.includes(f.key)} onChange={() => toggle(f.key)}
                  className="w-4 h-4 rounded border-outline-variant text-primary" />
                {ar ? f.ar : f.en}
              </label>
            ))}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">{ar ? 'التخطيط' : 'Per page'}</p>
          <div className="flex gap-1.5 mb-3">
            {([2, 4, 6] as const).map(n => (
              <button key={n} onClick={() => setLayout(n)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${layout === n ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container-low text-on-surface-variant border-transparent hover:border-outline-variant'}`}>
                {n}
              </button>
            ))}
          </div>
          <button onClick={exportLabels} disabled={busy}
            className="w-full py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
            {busy ? (ar ? '...' : 'Generating...') : (ar ? 'تصدير PDF' : 'Export PDF')}
          </button>
        </div>
      )}
    </div>
  )
}
