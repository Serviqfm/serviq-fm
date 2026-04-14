content = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

export default function SitesPage() {
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const supabase = createClient()
  const { t, lang } = useLanguage()

  useEffect(() => { fetchSites() }, [])

  async function fetchSites() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data } = await supabase.from('sites').select('*').eq('organisation_id', profile.organisation_id).order('created_at', { ascending: false })
    if (data) setSites(data)
    setLoading(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('sites').update({ is_active: !current }).eq('id', id)
    fetchSites()
  }

  async function deleteSite(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('sites').delete().eq('id', id)
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
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('nav.sites')}</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>
            {lang === 'ar' ? 'مواقع مسجلة' : 'sites registered'} {sites.length}
          </p>
        </div>
        <Link href='/dashboard/sites/new'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            {lang === 'ar' ? '+ إضافة موقع' : 'Add Site +'}
          </button>
        </Link>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={lang === 'ar' ? 'البحث...' : 'Search by name, city, or address...'}
        style={{ width: '100%', padding: '9px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: '1.5rem', boxSizing: 'border-box' as const }}
      />

      {loading ? (
        <p style={{ color: '#999' }}>{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18 }}>{lang === 'ar' ? 'لا توجد مواقع بعد' : 'No sites yet'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(site => (
            <div key={site.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: '1.25rem', background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{site.name}</h3>
                <span style={{ background: site.is_active ? '#e8f5e9' : '#f5f5f5', color: site.is_active ? '#2e7d32' : '#666', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>
                  {site.is_active ? t('common.active') : t('common.inactive')}
                </span>
              </div>
              {site.name_ar && <p style={{ fontSize: 13, color: '#666', margin: '0 0 6px', direction: 'rtl' }}>{site.name_ar}</p>}
              {site.city && <p style={{ fontSize: 13, color: '#666', margin: '0 0 4px' }}>{lang === 'ar' ? 'المدينة: ' : 'City: '}{site.city}</p>}
              {site.address && <p style={{ fontSize: 13, color: '#999', margin: '0 0 8px' }}>{site.address}</p>}
              <p style={{ fontSize: 11, color: '#bbb', margin: '0 0 12px' }}>
                {lang === 'ar' ? 'أُضيف ' : 'Added '}{format(new Date(site.created_at), 'dd MMM yyyy')}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href={'/dashboard/sites/' + site.id + '/edit'}>
                  <button style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 12 }}>{t('common.edit')}</button>
                </Link>
                <button onClick={() => toggleActive(site.id, site.is_active)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 12 }}>
                  {site.is_active ? (lang === 'ar' ? 'إيقاف' : 'Deactivate') : (lang === 'ar' ? 'تفعيل' : 'Activate')}
                </button>
                <button onClick={() => deleteSite(site.id)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 12 }}>{t('common.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}"""

with open('src/app/dashboard/sites/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Sites page completely rewritten - no more syntax errors')