'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function AssetImportPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ success: number; errors: string[] } | null>(null)

  function downloadTemplate() {
    const headers = 'name,category,site_name,sub_location,serial_number,manufacturer,model,purchase_date,purchase_cost,warranty_expiry,expected_lifespan_years,description,location_notes'
    const example = 'Carrier AC Unit Room 204,HVAC,Main Building,Floor 2 Room 204,SN-2024-001,Carrier,42QHC018DS,2024-01-15,12500,2027-01-15,10,Split AC unit 2 ton,Near east wall'
    const csv = headers + '\n' + example
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'serviq-fm-asset-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }

    const text = await file.text()
    const lines = text.trim().split(/\r?\n/)
    const headers = lines[0].split(',').map((h: string) => h.trim().replace(/"/g, ''))
    const rows = lines.slice(1)

    let success = 0
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const values = rows[i].split(',').map((v: string) => v.trim().replace(/"/g, ''))
      const row: any = headers.reduce((obj: any, h: string, j: number) => { obj[h] = values[j] || null; return obj }, {})
      if (!row.name) { errors.push('Row ' + (i + 2) + ': name is required'); continue }

      let siteId = null
      if (row.site_name) {
        const { data: site } = await supabase.from('sites').select('id').eq('organisation_id', profile.organisation_id).ilike('name', row.site_name).single()
        if (site) siteId = site.id
      }

      const qrCode = 'SERVIQ-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase()
      const { error } = await supabase.from('assets').insert({
        name: row.name,
        category: row.category || null,
        site_id: siteId,
        sub_location: row.sub_location || null,
        serial_number: row.serial_number || null,
        manufacturer: row.manufacturer || null,
        model: row.model || null,
        purchase_date: row.purchase_date || null,
        purchase_cost: row.purchase_cost ? parseFloat(row.purchase_cost) : null,
        warranty_expiry: row.warranty_expiry || null,
        expected_lifespan_years: row.expected_lifespan_years ? parseInt(row.expected_lifespan_years) : null,
        description: row.description || null,
        location_notes: row.location_notes || null,
        organisation_id: profile.organisation_id,
        status: 'active',
        qr_code: qrCode,
      })

      if (error) errors.push('Row ' + (i + 2) + ': ' + error.message)
      else success++
    }

    setResults({ success, errors })
    setLoading(false)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/assets' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Assets</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Import Assets from CSV</h1>
      </div>

      <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 8px', color: '#1565c0' }}>How to import</p>
        <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 13, color: '#333', lineHeight: 1.8 }}>
          <li>Download the CSV template below</li>
          <li>Fill in your assets — one row per asset</li>
          <li>For site_name use the exact site name as it appears in your Sites list</li>
          <li>Dates must be in YYYY-MM-DD format</li>
          <li>Upload the completed file below</li>
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
          {loading && <p style={{ fontSize: 13, color: '#666', marginTop: 12 }}>Importing assets... please wait</p>}
        </div>
      ) : (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ background: results.success > 0 ? '#e8f5e9' : '#fff8e1', border: '1px solid ' + (results.success > 0 ? '#a5d6a7' : '#ffe082'), borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: results.success > 0 ? '#2e7d32' : '#f57f17' }}>
              {results.success} asset{results.success !== 1 ? 's' : ''} imported successfully
            </p>
            {results.errors.length > 0 && <p style={{ fontSize: 13, color: '#c62828', margin: 0 }}>{results.errors.length} rows had errors</p>}
          </div>
          {results.errors.length > 0 && (
            <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '1rem' }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px', color: '#b71c1c' }}>Errors:</p>
              {results.errors.map((err, i) => <p key={i} style={{ fontSize: 12, margin: '0 0 4px', color: '#c62828' }}>{err}</p>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: '1rem' }}>
            <a href='/dashboard/assets'>
              <button style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>View Assets</button>
            </a>
            <button onClick={() => setResults(null)} style={{ padding: '8px 20px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Import More</button>
          </div>
        </div>
      )}
    </div>
  )
}