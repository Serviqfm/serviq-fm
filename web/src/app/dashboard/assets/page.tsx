'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'

export default function AssetsPage() {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const supabase = createClient()

  useEffect(() => { fetchAssets() }, [categoryFilter, statusFilter])

  async function fetchAssets() {
    setLoading(true)
    let query = supabase.from('assets').select('*, site:site_id(name)').order('created_at', { ascending: false })
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter)
    const { data, error } = await query
    if (!error && data) setAssets(data)
    setLoading(false)
  }

  const filtered = assets.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.serial_number?.toLowerCase().includes(search.toLowerCase()) ||
    a.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
    a.site?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
    active:            { bg: '#e8f5e9', color: '#2e7d32', label: 'Active' },
    under_maintenance: { bg: '#fff8e1', color: '#f57f17', label: 'Under Maintenance' },
    retired:           { bg: '#f5f5f5', color: '#424242', label: 'Retired' },
  }

  const categories = ['HVAC','Electrical','Plumbing','Elevator / Lift','Fire Safety','Furniture','Kitchen Equipment','Pool / Gym','IT Equipment','Signage','Vehicle','Other']

  const btnStyle = (active: boolean) => ({
    padding: '6px 14px', borderRadius: 20,
    border: '1px solid #ddd',
    background: active ? '#1a1a2e' : 'white',
    color: active ? 'white' : '#333',
    cursor: 'pointer', fontSize: 13, fontWeight: 500 as const,
  })

  const isWarrantyExpiringSoon = (date: string) => {
    if (!date) return false
    const days = Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0
  }

  const isWarrantyExpired = (date: string) => {
    if (!date) return false
    return new Date(date) < new Date()
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Assets</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{assets.length} total assets registered</p>
        </div>
        <Link href='/dashboard/assets/new'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            + Add Asset
          </button>
        </Link>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder='Search by name, serial number, manufacturer, or site...'
        style={{ width: '100%', padding: '9px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: '1rem', boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {['all','active','under_maintenance','retired'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={btnStyle(statusFilter === s)}>
            {s === 'all' ? 'All Status' : s.replace('_',' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => setCategoryFilter('all')} style={{ ...btnStyle(categoryFilter === 'all'), fontSize: 12, padding: '4px 12px' }}>All Categories</button>
        {categories.map(c => (
          <button key={c} onClick={() => setCategoryFilter(c)} style={{ ...btnStyle(categoryFilter === c), fontSize: 12, padding: '4px 12px' }}>{c}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#999' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No assets found</p>
          <p style={{ fontSize: 14 }}>Add your first asset to get started</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                {['Asset Name','Category','Site','Serial Number','Status','Warranty Expiry','Added'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset, i) => {
                const sCfg = statusConfig[asset.status] ?? statusConfig.active
                const warningSoon = isWarrantyExpiringSoon(asset.warranty_expiry)
                const expired = isWarrantyExpired(asset.warranty_expiry)
                return (
                  <tr key={asset.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <Link href={'/dashboard/assets/' + asset.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>
                        {asset.name}
                      </Link>
                      {asset.manufacturer && <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>{asset.manufacturer} {asset.model}</p>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{asset.category ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{asset.site?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666', fontFamily: 'monospace' }}>{asset.serial_number ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: sCfg.bg, color: sCfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>{sCfg.label}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>
                      {asset.warranty_expiry ? (
                        <span style={{ color: expired ? '#c62828' : warningSoon ? '#f57f17' : '#666' }}>
                          {format(new Date(asset.warranty_expiry), 'dd MMM yyyy')}
                          {expired && ' (Expired)'}
                          {warningSoon && !expired && ' (Expiring soon)'}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{format(new Date(asset.created_at), 'dd MMM yyyy')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}