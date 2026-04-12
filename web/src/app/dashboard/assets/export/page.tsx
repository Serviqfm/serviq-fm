'use client'

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
                    {a.status?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
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
}