'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, pageStyle, cardStyle, primaryBtn, secondaryBtn, inputStyle, dangerBtn } from '@/lib/brand'

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
    <div style={{ ...pageStyle, maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{t('nav.sites')}</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>
            {sites.length} {lang === 'ar' ? 'مواقع مسجلة' : 'sites registered'}
          </p>
        </div>
        <Link href='/dashboard/sites/new'>
          <button style={primaryBtn}>{lang === 'ar' ? '+ إضافة موقع' : 'Add Site +'}</button>
        </Link>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={lang === 'ar' ? 'البحث...' : 'Search by name, city, or address...'}
        style={{ ...inputStyle, marginBottom: '1.5rem' }}
      />

      {loading ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.textLight, fontFamily: F.en }}>
          <p style={{ fontSize: 18 }}>{lang === 'ar' ? 'لا توجد مواقع بعد' : 'No sites yet'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(site => (
            <div key={site.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: C.textDark, fontFamily: F.en }}>{site.name}</h3>
                <span style={{ background: site.is_active ? '#DCFCE7' : C.pageBg, color: site.is_active ? C.success : C.textMid, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontFamily: F.en }}>
                  {site.is_active ? t('common.active') : t('common.inactive')}
                </span>
              </div>
              {site.name_ar && <p style={{ fontSize: 13, color: C.textMid, margin: '0 0 6px', direction: 'rtl', fontFamily: F.ar }}>{site.name_ar}</p>}
              {site.city && <p style={{ fontSize: 13, color: C.textMid, margin: '0 0 4px', fontFamily: F.en }}>{lang === 'ar' ? 'المدينة: ' : 'City: '}{site.city}</p>}
              {site.address && <p style={{ fontSize: 13, color: C.textLight, margin: '0 0 8px', fontFamily: F.en }}>{site.address}</p>}
              <p style={{ fontSize: 11, color: C.textLight, margin: '0 0 12px', fontFamily: F.en }}>
                {lang === 'ar' ? 'أُضيف ' : 'Added '}{format(new Date(site.created_at), 'dd MMM yyyy')}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <Link href={'/dashboard/sites/' + site.id + '/edit'}>
                  <button style={{ ...secondaryBtn, padding: '5px 12px', fontSize: 12 }}>{t('common.edit')}</button>
                </Link>
                <button onClick={() => toggleActive(site.id, site.is_active)} style={{ ...secondaryBtn, padding: '5px 12px', fontSize: 12 }}>
                  {site.is_active ? (lang === 'ar' ? 'إيقاف' : 'Deactivate') : (lang === 'ar' ? 'تفعيل' : 'Activate')}
                </button>
                <button onClick={() => deleteSite(site.id)} style={{ ...dangerBtn, padding: '5px 12px', fontSize: 12 }}>{t('common.delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
