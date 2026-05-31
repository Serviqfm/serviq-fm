'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { exportCSV, parseCSV, readFileText } from '@/lib/csv'

const TEMPLATE_COLUMNS = ['name', 'name_ar', 'sku', 'category', 'unit', 'stock_quantity', 'minimum_stock_level', 'unit_cost']

const SAMPLE_ROWS = [
  { name: 'HVAC Filter 20x25', name_ar: 'فلتر تكييف 20x25', sku: 'HVAC-F-2025', category: 'HVAC', unit: 'pcs', stock_quantity: 24, minimum_stock_level: 10, unit_cost: 45 },
  { name: 'LED Bulb 9W', name_ar: 'لمبة ليد 9 واط', sku: 'EL-LED-9W', category: 'Electrical', unit: 'pcs', stock_quantity: 200, minimum_stock_level: 50, unit_cost: 12 },
]

export default function InventoryImportPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  function downloadTemplate() {
    exportCSV('inventory-template.csv', SAMPLE_ROWS)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const rows = parseCSV(await readFileText(file))
      if (rows.length === 0) { setError('CSV is empty.'); return }
      const unknown = Object.keys(rows[0]).filter(c => !TEMPLATE_COLUMNS.includes(c))
      if (unknown.length > 0) {
        setError(`Unknown columns will be ignored: ${unknown.join(', ')}`)
      }
      setPreview(rows)
    } catch (e) {
      setError(`Could not parse CSV: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function commit() {
    if (!preview) return
    setImporting(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in.'); setImporting(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile?.organisation_id) { setError('No organisation.'); setImporting(false); return }
    const payload = preview.filter(r => r.name).map(r => ({
      organisation_id: profile.organisation_id,
      name: r.name,
      name_ar: r.name_ar || null,
      sku: r.sku || null,
      category: r.category || null,
      unit: r.unit || 'pcs',
      stock_quantity: r.stock_quantity ? Number(r.stock_quantity) : 0,
      minimum_stock_level: r.minimum_stock_level ? Number(r.minimum_stock_level) : 0,
      unit_cost: r.unit_cost ? Number(r.unit_cost) : null,
    }))
    if (payload.length === 0) { setError('No rows had a name to import.'); setImporting(false); return }
    const { error: insertErr } = await supabase.from('inventory_items').insert(payload)
    if (insertErr) { setError('Import failed: ' + insertErr.message); setImporting(false); return }
    router.push('/dashboard/inventory')
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link href="/dashboard/inventory" className="text-sm text-on-surface-variant hover:text-primary">← Back to Inventory</Link>
          <h1 className="text-3xl font-bold text-on-surface mt-2">Import Inventory</h1>
          <p className="text-on-surface-variant mt-1 text-sm">Bulk-add inventory items from a CSV file.</p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 space-y-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-2">Step 1 — Download the template</div>
            <p className="text-sm text-on-surface-variant mb-3">
              The template has the columns we expect, with two example rows so you can see the format.
              Required: <span className="font-semibold text-on-surface">name</span>. Other columns are optional.
            </p>
            <button onClick={downloadTemplate}
              className="bg-secondary/10 text-secondary px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-secondary/20 transition-colors">
              <span className="material-symbols-outlined text-base">download</span>Download template CSV
            </button>
          </div>

          <div className="border-t border-outline-variant/40" />

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-2">Step 2 — Upload your filled-in CSV</div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-base">upload</span>Choose CSV file
            </button>
          </div>

          {error && <div className="bg-error/10 border border-error/20 text-error rounded-lg px-3 py-2 text-sm">{error}</div>}
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-2">Expected columns</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-on-surface-variant">
            {TEMPLATE_COLUMNS.map(c => (
              <code key={c} className="bg-surface-container-low rounded px-2 py-1 font-mono">{c}</code>
            ))}
          </div>
        </div>

        {preview && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden">
            <div className="px-4 py-3 border-b border-outline-variant flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-on-surface">Preview — {preview.length} row{preview.length === 1 ? '' : 's'}</div>
                <div className="text-xs text-on-surface-variant mt-0.5">Showing first 10 rows below. Click Import to commit.</div>
              </div>
              <button onClick={commit} disabled={importing}
                className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {importing ? 'Importing…' : `Import ${preview.length} row${preview.length === 1 ? '' : 's'}`}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-container-low">
                  <tr>
                    {TEMPLATE_COLUMNS.map(c => (
                      <th key={c} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-secondary">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/40">
                  {preview.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      {TEMPLATE_COLUMNS.map(c => (
                        <td key={c} className="px-3 py-2 whitespace-nowrap">{r[c] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
