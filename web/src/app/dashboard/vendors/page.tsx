'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const { t } = useLanguage()

  useEffect(() => { fetchVendors() }, [])

  async function fetchVendors() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      if (typeof window !== 'undefined') window.location.href = '/login'
      return
    }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) {
      setLoading(false)
      return
    }
    const { data } = await supabase.from('vendors').select('*').eq('organisation_id', profile.organisation_id).order('company_name', { ascending: true })
    if (data) setVendors(data)
    setLoading(false)
  }

  async function deleteSelected() {
    if (!confirm(t('common.confirm_delete'))) return
    setDeleting(true)
    await supabase.from('vendors').delete().in('id', selected)
    setSelected([])
    await fetchVendors()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('vendors').delete().eq('id', id)
    fetchVendors()
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('vendors').update({ is_active: !current }).eq('id', id)
    fetchVendors()
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelected(prev => prev.length === filtered.length ? [] : filtered.map(v => v.id))
  }

  const filtered = vendors.filter(v =>
    v.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.specialisation?.toLowerCase().includes(search.toLowerCase())
  )

  const stars = (rating: number) => {
    if (!rating) return '—'
    return Array.from({ length: 5 }, (_, i) => i < Math.round(rating) ? '★' : '☆').join('')
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('vendors.title')}</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{vendors.length} {t('vendors.title').toLowerCase()}</p>
        </div>
        <Link href='/dashboard/vendors/new'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>{t('btn.add_vendor')}</button>
        </Link>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('vendors.search')} style={{ width: '100%', padding: '9px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: '1rem', boxSizing: 'border-box' as const }} />

      {selected.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#b71c1c' }}>{selected.length}</span>
          <button onClick={deleteSelected} disabled={deleting} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#c62828', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
            {deleting ? t('common.loading') : t('btn.delete_selected')}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ef9a9a', background: 'white', cursor: 'pointer', fontSize: 12, color: '#666' }}>{t('common.cancel')}</button>
        </div>
      )}

      {loading ? <p style={{ color: '#999' }}>{t('common.loading')}</p> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>{t('vendors.title')}</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '12px 16px', width: 40 }}>
                  <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                {[t('vendors.col.company'),t('vendors.col.contact'),t('vendors.col.phone'),t('vendors.col.spec'),t('vendors.col.rating'),t('common.status'),t('common.actions')].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #f0f0f0', background: selected.includes(v.id) ? '#fff3f3' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <input type='checkbox' checked={selected.includes(v.id)} onChange={() => toggleSelect(v.id)} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={'/dashboard/vendors/' + v.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>{v.company_name}</Link>
                    {v.company_name_ar && <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0', direction: 'rtl' }}>{v.company_name_ar}</p>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{v.contact_name ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{v.phone ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{v.specialisation ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#f57f17' }}>{stars(v.average_rating)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: v.is_active ? '#e8f5e9' : '#f5f5f5', color: v.is_active ? '#2e7d32' : '#666', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                      {v.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Link href={'/dashboard/vendors/' + v.id}>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>{t('common.view')}</button>
                      </Link>
                      <Link href={'/dashboard/vendors/' + v.id + '/edit'}>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>{t('common.edit')}</button>
                      </Link>
                      <button onClick={() => toggleActive(v.id, v.is_active)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11, color: '#666' }}>
                        {v.is_active ? t('common.deactivate') : t('common.activate')}
                      </button>
                      <button onClick={() => deleteOne(v.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 11 }}>{t('common.delete')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}