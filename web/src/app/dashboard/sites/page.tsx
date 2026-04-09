'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'

export default function SitesPage() {
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const supabase = createClient()

  useEffect(() => { fetchSites() }, [])

  async function fetchSites() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('sites').select('*').eq('organisation_id', profile.organisation_id).order('created_at', { ascending: false })
    if (data) setSites(data)
    setLoading(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('sites').update({ is_active: !current }).eq('id', id)
    fetchSites()
  }

  const filtered = sites.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.city?.toLowerCase().includes(search.toLowerCase()) ||
    s.address?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Sites</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{sites.length} sites registered</p>
        </div>
        <Link href='/dashboard/sites/new'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            + Add Site
          </button>
        </Link>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder='Search by name, city, or address...'
        style={{ width: '100%', padding: '9px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: '1.5rem', boxSizing: 'border-box' }}
      />

      {loading ? (
        <p style={{ color: '#999' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No sites yet</p>
          <p style={{ fontSize: 14 }}>Add your first site to enable location tracking across work orders and assets</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(site => (
            <div key={site.id} style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{site.name}</p>
                  {site.name_ar && <p style={{ fontSize: 13, color: '#999', margin: '2px 0 0', direction: 'rtl' }}>{site.name_ar}</p>}
                </div>
                <span style={{ background: site.is_active ? '#e8f5e9' : '#f5f5f5', color: site.is_active ? '#2e7d32' : '#666', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                  {site.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {site.city && <p style={{ fontSize: 13, color: '#666', margin: '0 0 4px' }}>City: {site.city}</p>}
              {site.address && <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>{site.address}</p>}
              <p style={{ fontSize: 12, color: '#bbb', margin: '0 0 12px' }}>Added {format(new Date(site.created_at), 'dd MMM yyyy')}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href={'/dashboard/sites/' + site.id}>
                  <button style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                </Link>
                <button onClick={() => toggleActive(site.id, site.is_active)} style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 12, color: '#666' }}>
                  {site.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}