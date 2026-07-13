'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { parseCSV, readFileText } from '@/lib/csv'

const TEMPLATE_HEADERS = 'title,description,wo_number,due_date,status,priority,category,assignee_email,team,asset_name,site_name,estimated_hours,additional_cost'
const TEMPLATE_EXAMPLE = 'Fix rooftop AC unit,Compressor keeps tripping the breaker,,2026-08-01,new,high,HVAC,tech@example.com,,Carrier AC Unit Room 204,Main Building,3,250'

type ImportResult = { created: number; updated: number; errors: string[]; warnings: string[] }

export default function WorkOrderImportPage() {
  const router = useRouter()
  const supabase = createClient()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  // Import is manager/admin only (the API also enforces this). Bounce others so
  // they never see an upload form they can't submit.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (profile && ['admin', 'manager'].includes(profile.role ?? '')) setAllowed(true)
      else { setAllowed(false); router.replace('/dashboard/work-orders') }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function downloadTemplate() {
    const csv = TEMPLATE_HEADERS + '\n' + TEMPLATE_EXAMPLE
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'serviq-fm-work-order-import-template.csv'
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
      const res = await fetch('/api/work-orders/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? 'Import failed')
      } else {
        setResults(data as ImportResult)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    }
    setLoading(false)
    e.target.value = '' // allow re-uploading the same file after a fix
  }

  const total = results ? results.created + results.updated : 0

  if (allowed === null) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!allowed) return null

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/work-orders' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Work Orders</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Import Work Orders from CSV</h1>
      </div>

      <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 8px', color: '#1565c0' }}>How to import</p>
        <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 13, color: '#333', lineHeight: 1.8 }}>
          <li>Download the CSV template below and fill in one row per work order</li>
          <li><strong>title</strong> is required for new rows; leave <strong>wo_number</strong> blank to auto-number</li>
          <li>To <strong>update</strong> an existing work order, put its number in <strong>wo_number</strong> (e.g. 42) — only the columns you fill are changed</li>
          <li><strong>asset_name</strong>, <strong>site_name</strong>, <strong>team</strong> must match names as they appear in the app; <strong>assignee_email</strong> must be a user&apos;s email (unmatched names are left blank with a warning)</li>
          <li>priority: low/medium/high/critical · status: new/assigned/in_progress/on_hold/completed/closed · dates: YYYY-MM-DD</li>
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
          {loading && <p style={{ fontSize: 13, color: '#666', marginTop: 12 }}>Importing work orders... please wait</p>}
          {error && <p style={{ fontSize: 13, color: '#c62828', marginTop: 12 }}>{error}</p>}
        </div>
      ) : (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ background: total > 0 ? '#e8f5e9' : '#fff8e1', border: '1px solid ' + (total > 0 ? '#a5d6a7' : '#ffe082'), borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: total > 0 ? '#2e7d32' : '#f57f17' }}>
              {results.created} created · {results.updated} updated
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
            <a href='/dashboard/work-orders'>
              <button style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>View Work Orders</button>
            </a>
            <button onClick={() => { setResults(null); setError('') }} style={{ padding: '8px 20px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Import More</button>
          </div>
        </div>
      )}
    </div>
  )
}
