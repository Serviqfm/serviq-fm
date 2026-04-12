import os

# ── Asset Export utility ──
os.makedirs('src/app/dashboard/assets/export', exist_ok=True)

asset_export = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'

export default function AssetExportPage() {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const supabase = createClient()

  useEffect(() => { fetchAssets() }, [])

  async function fetchAssets() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('assets').select('*, site:site_id(name)').eq('organisation_id', profile.organisation_id).order('name')
    if (data) setAssets(data)
    setLoading(false)
  }

  function exportCSV() {
    setExporting(true)
    const headers = ['Name','Category','Site','Sub-location','Serial Number','Manufacturer','Model','Purchase Date','Purchase Cost (SAR)','Warranty Expiry','Expected Lifespan (years)','Status','Location Notes','Description']
    const rows = assets.map(a => [
      a.name ?? '',
      a.category ?? '',
      a.site?.name ?? '',
      a.sub_location ?? '',
      a.serial_number ?? '',
      a.manufacturer ?? '',
      a.model ?? '',
      a.purchase_date ? format(new Date(a.purchase_date), 'dd/MM/yyyy') : '',
      a.purchase_cost ?? '',
      a.warranty_expiry ? format(new Date(a.warranty_expiry), 'dd/MM/yyyy') : '',
      a.expected_lifespan_years ?? '',
      a.status ?? '',
      a.location_notes ?? '',
      a.description ?? '',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'serviq-fm-assets-' + format(new Date(), 'yyyy-MM-dd') + '.csv'
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  function exportPrint() {
    window.print()
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading assets...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Export Assets</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{assets.length} assets ready to export</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href='/dashboard/assets'>
            <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontSize: 13 }}>Back to Assets</button>
          </a>
          <button onClick={exportCSV} disabled={exporting} style={{ background: '#2e7d32', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
            Download CSV
          </button>
          <button onClick={exportPrint} style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
            Print / PDF
          </button>
        </div>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              {['Name','Category','Site','Sub-location','Serial Number','Manufacturer','Status','Warranty Expiry','Purchase Cost'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => (
              <tr key={a.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500 }}>{a.name}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#666' }}>{a.category ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#666' }}>{a.site?.name ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#666' }}>{a.sub_location ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#666', fontFamily: 'monospace' }}>{a.serial_number ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#666' }}>{a.manufacturer ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13 }}>
                  <span style={{ background: a.status === 'active' ? '#e8f5e9' : a.status === 'under_maintenance' ? '#fff8e1' : '#f5f5f5', color: a.status === 'active' ? '#2e7d32' : a.status === 'under_maintenance' ? '#f57f17' : '#666', padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 500 }}>
                    {a.status?.replace('_', ' ').replace(/\\b\\w/g, (l: string) => l.toUpperCase())}
                  </span>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#666' }}>{a.warranty_expiry ? format(new Date(a.warranty_expiry), 'dd MMM yyyy') : '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: '#666' }}>{a.purchase_cost ? 'SAR ' + Number(a.purchase_cost).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}"""

with open('src/app/dashboard/assets/export/page.tsx', 'w', encoding='utf-8') as f:
    f.write(asset_export)
print('asset export page written')

# ── Asset Import page ──
os.makedirs('src/app/dashboard/assets/import', exist_ok=True)

asset_import = """'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AssetImportPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{ success: number; errors: string[] } | null>(null)
  const [preview, setPreview] = useState<any[]>([])

  function downloadTemplate() {
    const headers = ['name','category','site_name','sub_location','serial_number','manufacturer','model','purchase_date','purchase_cost','warranty_expiry','expected_lifespan_years','description','location_notes']
    const example = ['Carrier AC Unit Room 204','HVAC','Main Building','Floor 2 Room 204','SN-2024-001','Carrier','42QHC018DS','2024-01-15','12500','2027-01-15','10','Split AC unit 2 ton','Near east wall']
    const csv = [headers, example].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'serviq-fm-asset-import-template.csv'
    a.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
      return headers.reduce((obj: any, h, i) => { obj[h] = values[i] || ''; return obj }, {})
    })
    setPreview(rows.slice(0, 5))
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
    const lines = text.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const rows = lines.slice(1)

    let success = 0
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const values = rows[i].split(',').map(v => v.trim().replace(/"/g, ''))
      const row: any = headers.reduce((obj: any, h, j) => { obj[h] = values[j] || null; return obj }, {})
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
          <li>For site_name: use the exact site name as it appears in your Sites list</li>
          <li>Dates must be in YYYY-MM-DD format (e.g. 2024-01-15)</li>
          <li>Upload the completed file below</li>
        </ol>
        <button onClick={downloadTemplate} style={{ marginTop: '1rem', padding: '8px 18px', background: '#1565c0', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          Download CSV Template
        </button>
      </div>

      {!results && (
        <div style={{ border: '2px dashed #ddd', borderRadius: 10, padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 8px' }}>Upload your CSV file</p>
          <p style={{ fontSize: 13, color: '#999', margin: '0 0 16px' }}>Select the completed template file to begin import</p>
          <input type='file' accept='.csv' onChange={handleImport} disabled={loading} style={{ fontSize: 13 }} />
          {loading && <p style={{ fontSize: 13, color: '#666', marginTop: 12 }}>Importing assets... please wait</p>}
        </div>
      )}

      {results && (
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
}"""

with open('src/app/dashboard/assets/import/page.tsx', 'w', encoding='utf-8') as f:
    f.write(asset_import)
print('asset import page written')

# ── Update asset detail page to add custom fields + decommission workflow ──
with open('src/app/dashboard/assets/[id]/page.tsx', 'r', encoding='utf-8') as f:
    detail = f.read()

# Add decommission button
old_buttons = "        <Link href={'/dashboard/work-orders/new?asset_id=' + asset.id}>\n          <button style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>+ New Work Order</button>\n        </Link>"

new_buttons = """        <Link href={'/dashboard/work-orders/new?asset_id=' + asset.id}>
          <button style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>+ New Work Order</button>
        </Link>
        {asset.status !== 'retired' && (
          <button
            onClick={async () => {
              if (!confirm('Decommission this asset? This will retire it and suspend all active PM schedules.')) return
              await supabase.from('assets').update({ status: 'retired', updated_at: new Date().toISOString() }).eq('id', id)
              await supabase.from('pm_schedules').update({ is_active: false }).eq('asset_id', id)
              await supabase.from('work_orders').insert({
                title: 'Decommission: ' + asset.name,
                description: 'Final decommission work order. Asset has been retired.',
                priority: 'medium',
                status: 'new',
                source: 'manual',
                asset_id: id,
                organisation_id: asset.organisation_id,
                created_by: (await supabase.auth.getUser()).data.user?.id,
              })
              fetchAll()
            }}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #c62828', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 13 }}
          >
            Decommission Asset
          </button>
        )}"""

if old_buttons in detail:
    detail = detail.replace(old_buttons, new_buttons)
    print('Decommission button added')
else:
    print('Decommission pattern not found - skipping')

# Add custom fields tab
old_tabs = "        <button style={tabStyle(activeTab === 'qr')} onClick={() => setActiveTab('qr')}>QR Code</button>"
new_tabs = """        <button style={tabStyle(activeTab === 'qr')} onClick={() => setActiveTab('qr')}>QR Code</button>
        <button style={tabStyle(activeTab === 'custom')} onClick={() => setActiveTab('custom')}>Custom Fields</button>"""

old_tab_type = "'details' | 'workorders' | 'pm' | 'photos' | 'qr'"
new_tab_type = "'details' | 'workorders' | 'pm' | 'photos' | 'qr' | 'custom'"

detail = detail.replace(old_tab_type, new_tab_type)
detail = detail.replace(old_tabs, new_tabs)

# Add custom fields tab content before closing div
old_end = "\n    </div>\n  )\n}"
new_custom_tab = """
      {activeTab === 'custom' && (
        <CustomFieldsTab assetId={id as string} initialFields={asset.custom_fields ?? {}} supabase={supabase} />
      )}
    </div>
  )
}

function CustomFieldsTab({ assetId, initialFields, supabase }: { assetId: string; initialFields: Record<string, string>; supabase: any }) {
  const [fields, setFields] = useState<Record<string, string>>(initialFields)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function addField() {
    if (!newKey.trim()) return
    const updated = { ...fields, [newKey.trim()]: newValue.trim() }
    setSaving(true)
    await supabase.from('assets').update({ custom_fields: updated }).eq('id', assetId)
    setFields(updated)
    setNewKey('')
    setNewValue('')
    setSaving(false)
  }

  async function removeField(key: string) {
    const updated = { ...fields }
    delete updated[key]
    await supabase.from('assets').update({ custom_fields: updated }).eq('id', assetId)
    setFields(updated)
  }

  const inputStyle = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, flex: 1 }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', marginBottom: '1rem' }}>Add custom fields to capture asset-specific data like hotel room number, classroom ID, or target temperature.</p>
      {Object.keys(fields).length === 0 ? (
        <p style={{ fontSize: 13, color: '#999', marginBottom: '1rem' }}>No custom fields yet.</p>
      ) : (
        <div style={{ marginBottom: '1rem' }}>
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, background: '#f9f9f9', borderRadius: 8, padding: '8px 12px' }}>
              <span style={{ fontSize: 13, fontWeight: 500, minWidth: 150 }}>{key}</span>
              <span style={{ fontSize: 13, color: '#666', flex: 1 }}>{value}</span>
              <button onClick={() => removeField(key)} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 13 }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder='Field name (e.g. Room Number)' style={inputStyle} />
        <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder='Value (e.g. 204)' style={inputStyle} />
        <button onClick={addField} disabled={saving || !newKey.trim()} style={{ padding: '8px 18px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          {saving ? '...' : 'Add Field'}
        </button>
      </div>
    </div>
  )
}"""

detail = detail.replace(old_end, new_custom_tab)

# Add useState import for CustomFieldsTab
if "import { useEffect, useState } from 'react'" not in detail:
    detail = detail.replace(
        "import { useEffect, useState } from 'react'",
        "import { useEffect, useState } from 'react'"
    )

with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(detail)
print('asset detail page updated with decommission + custom fields')

# Update asset list page to add Import and Export buttons
with open('src/app/dashboard/assets/page.tsx', 'r', encoding='utf-8') as f:
    assets_list = f.read()

assets_list = assets_list.replace(
    "        <Link href='/dashboard/assets/new'>",
    """        <Link href='/dashboard/assets/import'>
          <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
            Import CSV
          </button>
        </Link>
        <Link href='/dashboard/assets/export'>
          <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
            Export
          </button>
        </Link>
        <Link href='/dashboard/assets/new'>"""
)

with open('src/app/dashboard/assets/page.tsx', 'w', encoding='utf-8') as f:
    f.write(assets_list)
print('assets list page updated with import/export buttons')
print('All asset updates complete')