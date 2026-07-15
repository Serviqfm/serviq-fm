'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { parseCSV, readFileText } from '@/lib/csv'

// Header order matches the list-page export so an export → import round-trips.
const TEMPLATE_HEADERS = 'name,name_ar,description,type_name,brand,model,serial_number,tracking_mode,quantity,site_name,space_name,status,purchase_date,purchase_cost,replacement_cost,current_value_override,expected_lifespan_years,invoice_ref,warranty_provider,warranty_expiry,condition_rating,is_usable,condition_notes,condition_review_interval_months'
const TEMPLATE_EXAMPLE = 'Conference Table,طاولة اجتماعات,Large oak table,Furniture,IKEA,BEKANT,SN-001,unit,1,Main Building,Meeting Room A,in_use,2025-01-15,1200,1500,,10,INV-2025-001,IKEA,2027-01-15,4,true,Minor scratch on edge,12'

type ImportResult = { created: number; errors: string[]; warnings: string[] }

export default function AssetLogImportPage() {
  const router = useRouter()
  const supabase = createClient()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  // Import is manager/admin only (the API also enforces this). Bounce others.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (profile && ['admin', 'manager'].includes(profile.role ?? '')) setAllowed(true)
      else { setAllowed(false); router.replace('/dashboard/asset-log') }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function downloadTemplate() {
    const csv = TEMPLATE_HEADERS + '\n' + TEMPLATE_EXAMPLE
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'serviq-fm-asset-log-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError('')
    setResults(null)
    try {
      const text = await readFileText(file)
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setError('The file has no data rows.')
        setLoading(false)
        e.target.value = ''
        return
      }
      const res = await fetch('/api/asset-log/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data?.error ?? 'Import failed')
      else setResults(data as ImportResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    }
    setLoading(false)
    e.target.value = '' // allow re-uploading the same file after a fix
  }

  if (allowed === null) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!allowed) return null

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/asset-log' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Asset Log</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Import Asset Log Items from CSV</h1>
      </div>

      <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 8px', color: '#1565c0' }}>How to import</p>
        <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 13, color: '#333', lineHeight: 1.8 }}>
          <li>Download the CSV template below and fill in one row per item</li>
          <li><strong>name</strong> is required; every other column is optional</li>
          <li><strong>type_name</strong> is matched by name and <strong>created automatically</strong> if it does not exist yet</li>
          <li><strong>site_name</strong> / <strong>space_name</strong> must match names as they appear in the app (a space derives its site; unmatched names error the row)</li>
          <li>status: in_storage/in_use/under_repair/damaged/disposed · tracking_mode: unit/bulk · condition_rating: 1–5 · dates: YYYY-MM-DD</li>
        </ol>
        <button onClick={downloadTemplate} style={{ marginTop: '1rem', padding: '8px 18px', background: '#1565c0', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          Download CSV Template
        </button>
      </div>

      {!results ? (
        <div style={{ border: '2px dashed #ddd', borderRadius: 10, padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 8px' }}>Upload your CSV file</p>
          <p style={{ fontSize: 13, color: '#999', margin: '0 0 16px' }}>Select the completed template to begin import</p>
          <input type='file' accept='.csv' onChange={handleImport} disabled={loading} style={{ fontSize: 13 }} />
          {loading && <p style={{ fontSize: 13, color: '#666', marginTop: 12 }}>Importing items... please wait</p>}
          {error && <p style={{ fontSize: 13, color: '#c62828', marginTop: 12 }}>{error}</p>}
        </div>
      ) : (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ background: results.created > 0 ? '#e8f5e9' : '#fff8e1', border: '1px solid ' + (results.created > 0 ? '#a5d6a7' : '#ffe082'), borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: results.created > 0 ? '#2e7d32' : '#f57f17' }}>
              {results.created} created
            </p>
            {results.errors.length > 0 && <p style={{ fontSize: 13, color: '#c62828', margin: 0 }}>{results.errors.length} row{results.errors.length !== 1 ? 's' : ''} had errors</p>}
          </div>
          {results.warnings.length > 0 && (
            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px', color: '#f57f17' }}>Warnings:</p>
              {results.warnings.map((w, i) => <p key={i} style={{ fontSize: 12, margin: '0 0 4px', color: '#8a6d00' }}>{w}</p>)}
            </div>
          )}
          {results.errors.length > 0 && (
            <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '1rem' }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px', color: '#b71c1c' }}>Errors:</p>
              {results.errors.map((err, i) => <p key={i} style={{ fontSize: 12, margin: '0 0 4px', color: '#c62828' }}>{err}</p>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: '1rem' }}>
            <a href='/dashboard/asset-log'>
              <button style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>View Asset Log</button>
            </a>
            <button onClick={() => { setResults(null); setError('') }} style={{ padding: '8px 20px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Import More</button>
          </div>
        </div>
      )}
    </div>
  )
}
