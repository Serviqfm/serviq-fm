'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { exportCSV, parseCSV, readFileText } from '@/lib/csv'
import { useFeatureFlag } from '@/lib/featureFlags'
import { usePagination } from '@/lib/usePagination'
import Pagination from '@/components/Pagination'

export default function SitesPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [orgId, setOrgId] = useState<string | null>(null)
  // Whole-org count for the header + multi-site gate (not just the current page).
  const [totalSites, setTotalSites] = useState(0)
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const { flags } = useFeatureFlag()
  const canAddSite = flags.multi_site || totalSites === 0

  // AL-20 — inline site→space tree with re-parenting.
  const [showTree, setShowTree] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [treeSites, setTreeSites] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [treeSpaces, setTreeSpaces] = useState<any[]>([])
  const [treeLoading, setTreeLoading] = useState(false)

  async function loadTree() {
    if (!orgId) return
    setTreeLoading(true)
    const [{ data: st }, { data: sp }] = await Promise.all([
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).order('name'),
      supabase.from('spaces').select('id, name, floor, site_id').order('floor').order('name'),
    ])
    setTreeSites(st ?? [])
    setTreeSpaces(sp ?? [])
    setTreeLoading(false)
  }

  async function moveSpace(spaceId: string, siteId: string) {
    const res = await fetch(`/api/spaces/${spaceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_id: siteId }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert('Move failed: ' + (j.error ?? 'Unknown error'))
      return
    }
    setTreeSpaces(prev => prev.map(s => s.id === spaceId ? { ...s, site_id: siteId } : s))
  }

  // Debounce search so we don't fire a query on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
      if (profile) setOrgId(profile.organisation_id)
    })
  }, [supabase])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { rows: filtered, loading, page, pageCount, from, to, total, hasPrev, hasNext, prev, next, refresh } = usePagination<any>(
    () => {
      let q = supabase.from('sites').select('*', { count: 'exact' })
        .eq('organisation_id', orgId!).order('created_at', { ascending: false })
      if (debouncedSearch) {
        const s = `%${debouncedSearch}%`
        q = q.or(`name.ilike.${s},city.ilike.${s},address.ilike.${s}`)
      }
      return q
    },
    [orgId, debouncedSearch],
  )

  // Whole-org total for the header/gate, refreshed alongside the list.
  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    supabase.from('sites').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId)
      .then(({ count }) => { if (!cancelled) setTotalSites(count ?? 0) })
    return () => { cancelled = true }
  }, [orgId, total, supabase])

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('sites').update({ is_active: !current }).eq('id', id)
    refresh()
  }

  async function deleteSite(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('sites').delete().eq('id', id)
    refresh()
  }

  const importRef = useRef<HTMLInputElement>(null)
  async function handleExport() {
    if (!orgId) return
    const { data: sites } = await supabase.from('sites').select('*').eq('organisation_id', orgId).order('created_at', { ascending: false })
    if (!sites || sites.length === 0) { alert('No sites to export.'); return }
    exportCSV(`sites-${new Date().toISOString().slice(0, 10)}.csv`, sites.map(s => ({
      name: s.name ?? '', name_ar: s.name_ar ?? '', city: s.city ?? '', address: s.address ?? '',
      invoicing_enabled: s.invoicing_enabled ? 'true' : 'false',
    })))
  }
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const rows = parseCSV(await readFileText(file))
      if (rows.length === 0) { alert('CSV had no data rows.'); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert('Not signed in.'); return }
      const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
      if (!profile?.organisation_id) { alert('No organisation.'); return }
      const payload = rows.filter(r => r.name).map(r => ({
        organisation_id: profile.organisation_id,
        name: r.name,
        name_ar: r.name_ar || null,
        city: r.city || null,
        address: r.address || null,
        invoicing_enabled: r.invoicing_enabled === 'true',
        is_active: true,
      }))
      if (payload.length === 0) { alert('No rows had a name to import.'); return }
      const { error } = await supabase.from('sites').insert(payload)
      if (error) { alert('Import failed: ' + error.message); return }
      alert(`Imported ${payload.length} site(s).`)
      refresh()
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('nav.sites')}</h1>
            <p className="text-sm text-on-surface-variant mt-1">
              {totalSites} {lang === 'ar' ? 'مواقع مسجلة' : 'sites registered'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={importRef} type="file" accept=".csv,text/csv" onChange={handleImport} className="hidden" />
            <button onClick={() => { const n = !showTree; setShowTree(n); if (n && treeSites.length === 0) loadTree() }} className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-surface-container-low transition-colors">
              {showTree ? (lang === 'ar' ? 'إخفاء الشجرة' : 'Hide Tree') : (lang === 'ar' ? 'عرض الشجرة' : 'Location Tree')}
            </button>
            <button onClick={() => importRef.current?.click()} className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-surface-container-low transition-colors">Import CSV</button>
            <button onClick={handleExport} className="bg-secondary/10 text-secondary px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-secondary/20 transition-colors">Export CSV</button>
            {canAddSite ? (
              <Link href='/dashboard/sites/new'>
                <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                  {lang === 'ar' ? '+ إضافة موقع' : 'Add Site +'}
                </button>
              </Link>
            ) : (
              <button disabled title="Multi-site is not enabled for your plan. Contact your platform admin to enable it."
                className="bg-surface-container-low border border-outline-variant text-on-surface-variant px-5 py-2.5 rounded-xl font-semibold text-sm opacity-60 cursor-not-allowed">
                {lang === 'ar' ? 'محدود بموقع واحد' : 'Single-site plan'}
              </button>
            )}
          </div>
        </div>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={lang === 'ar' ? 'البحث...' : 'Search by name, city, or address...'}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
        />

        {showTree && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
            <h2 className="text-sm font-bold text-on-surface mb-3">{lang === 'ar' ? 'شجرة المواقع والمساحات' : 'Site → Space Tree'}</h2>
            {treeLoading ? (
              <p className="text-on-surface-variant text-sm">{t('common.loading')}</p>
            ) : treeSites.length === 0 ? (
              <p className="text-on-surface-variant text-sm">{lang === 'ar' ? 'لا توجد مواقع' : 'No sites yet.'}</p>
            ) : (
              <div className="space-y-4">
                {treeSites.map(site => {
                  const kids = treeSpaces.filter(sp => sp.site_id === site.id)
                  return (
                    <div key={site.id}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-on-surface font-semibold text-sm">{site.name}</span>
                        <span className="text-xs text-on-surface-variant">{kids.length} {lang === 'ar' ? 'مساحة' : 'space(s)'}</span>
                      </div>
                      {kids.length === 0 ? (
                        <p className="text-xs text-on-surface-variant ps-4">{lang === 'ar' ? 'لا توجد مساحات' : 'No spaces'}</p>
                      ) : (
                        <ul className="ps-4 border-s border-outline-variant/50 space-y-1.5">
                          {kids.map(sp => (
                            <li key={sp.id} className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-on-surface">{sp.name}</span>
                              {sp.floor && <span className="text-xs text-on-surface-variant">({sp.floor})</span>}
                              <label className="text-[11px] text-on-surface-variant ms-auto">{lang === 'ar' ? 'نقل إلى:' : 'Move to:'}</label>
                              <select value={sp.site_id} onChange={e => { if (e.target.value !== sp.site_id) moveSpace(sp.id, e.target.value) }}
                                className="bg-surface-container-low border border-outline-variant/40 rounded-lg px-2 py-1 text-xs text-on-surface outline-none">
                                {treeSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

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
                  <Link href={`/dashboard/sites/${site.id}`} className="text-[15px] font-semibold text-on-surface hover:text-primary transition-colors">{site.name}</Link>
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
                  <Link href={`/dashboard/sites/${site.id}`}>
                    <button className="border border-outline-variant text-on-surface-variant px-3 py-1 rounded-xl text-xs font-semibold hover:bg-surface-container-low transition-colors">{lang === 'ar' ? 'عرض' : 'View'}</button>
                  </Link>
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

        {!loading && (
          <Pagination page={page} pageCount={pageCount} from={from} to={to} total={total}
            hasPrev={hasPrev} hasNext={hasNext} prev={prev} next={next} label={lang === 'ar' ? 'مواقع' : 'sites'} />
        )}
      </div>
    </div>
  )
}
