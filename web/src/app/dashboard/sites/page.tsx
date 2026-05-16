'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

export default function SitesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const supabase = createClient()
  const { t, lang } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('nav.sites')}</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              {sites.length} {lang === 'ar' ? 'مواقع مسجلة' : 'sites registered'}
            </p>
          </div>
          <Link href='/dashboard/sites/new'>
            <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
              {lang === 'ar' ? '+ إضافة موقع' : 'Add Site +'}
            </button>
          </Link>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={lang === 'ar' ? 'البحث...' : 'Search by name, city, or address...'}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
        />

        {loading ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant">
            <p className="text-lg">{lang === 'ar' ? 'لا توجد مواقع بعد' : 'No sites yet'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {filtered.map(site => (
              <div key={site.id} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-[15px] font-semibold text-on-surface">{site.name}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${site.is_active ? 'bg-primary/10 text-primary' : 'bg-surface-container-low text-on-surface-variant'}`}>
                    {site.is_active ? t('common.active') : t('common.inactive')}
                  </span>
                </div>
                {site.name_ar && <p className="text-[13px] text-on-surface-variant mb-1.5 text-right" dir="rtl">{site.name_ar}</p>}
                {site.city && <p className="text-[13px] text-on-surface-variant mb-1">{lang === 'ar' ? 'المدينة: ' : 'City: '}{site.city}</p>}
                {site.address && <p className="text-[13px] text-outline mb-2">{site.address}</p>}
                <p className="text-[11px] text-outline mb-3">
                  {lang === 'ar' ? 'أُضيف ' : 'Added '}{format(new Date(site.created_at), 'dd MMM yyyy')}
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Link href={`/dashboard/sites/${site.id}/spaces`}>
                    <button className="border border-outline-variant text-on-surface-variant px-3 py-1 rounded-xl text-xs font-semibold hover:bg-surface-container-low transition-colors">Spaces</button>
                  </Link>
                  <Link href={'/dashboard/sites/' + site.id + '/edit'}>
                    <button className="border border-outline-variant text-on-surface-variant px-3 py-1 rounded-xl text-xs font-semibold hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                  </Link>
                  <button onClick={() => toggleActive(site.id, site.is_active)} className="border border-outline-variant text-on-surface-variant px-3 py-1 rounded-xl text-xs font-semibold hover:bg-surface-container-low transition-colors">
                    {site.is_active ? (lang === 'ar' ? 'إيقاف' : 'Deactivate') : (lang === 'ar' ? 'تفعيل' : 'Activate')}
                  </button>
                  <button onClick={() => deleteSite(site.id)} className="text-error border border-error/20 bg-error/10 px-3 py-1 rounded-xl text-xs font-semibold hover:bg-error/20 transition-colors">{t('common.delete')}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
