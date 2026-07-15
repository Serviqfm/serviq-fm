'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'
import { exportCSV, parseCSV, readFileText } from '@/lib/csv'
import { usePagination } from '@/lib/usePagination'
import Pagination from '@/components/Pagination'

export default function VendorsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)
  // Whole-org stats (all vendors, not just the current page).
  const [stats, setStats] = useState({ total: 0, active: 0, rated: 0, avgRating: '—' })
  const supabase = createClient()
  const { t } = useLanguage()

  // Debounce search so we don't fire a query on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
      const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
      if (profile) setOrgId(profile.organisation_id)
    })
  }, [supabase])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { rows: filtered, total, loading, page, pageCount, from, to, hasPrev, hasNext, prev, next, refresh } = usePagination<any>(
    () => {
      let q = supabase.from('vendors').select('*', { count: 'exact' })
        .eq('organisation_id', orgId!).order('company_name', { ascending: true })
      if (debouncedSearch) {
        const s = `%${debouncedSearch}%`
        q = q.or(`company_name.ilike.${s},contact_name.ilike.${s},specialisation.ilike.${s}`)
      }
      return q
    },
    [orgId, debouncedSearch],
  )

  // Whole-org stats, refreshed alongside the list.
  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    supabase.from('vendors').select('is_active, average_rating').eq('organisation_id', orgId)
      .then(({ data }) => {
        if (cancelled || !data) return
        setStats({
          total: data.length,
          active: data.filter(v => v.is_active).length,
          rated: data.filter(v => v.average_rating && v.average_rating >= 4).length,
          avgRating: data.length > 0 ? (data.reduce((s, v) => s + (v.average_rating || 0), 0) / data.length).toFixed(1) : '—',
        })
      })
    return () => { cancelled = true }
  }, [orgId, total, supabase])

  async function deleteSelected() {
    if (!confirm(t('common.confirm_delete'))) return
    setDeleting(true)
    await supabase.from('vendors').delete().in('id', selected)
    setSelected([])
    refresh()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('vendors').delete().eq('id', id)
    refresh()
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('vendors').update({ is_active: !current }).eq('id', id)
    refresh()
  }

  const importRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    if (!orgId) return
    const { data: vendors } = await supabase.from('vendors').select('*').eq('organisation_id', orgId).order('company_name', { ascending: true })
    if (!vendors || vendors.length === 0) { alert('No vendors to export.'); return }
    exportCSV(`vendors-${new Date().toISOString().slice(0, 10)}.csv`, vendors.map(v => ({
      company_name: v.company_name ?? '',
      company_name_ar: v.company_name_ar ?? '',
      specialisation: v.specialisation ?? '',
      email: v.email ?? '',
      phone: v.phone ?? '',
      contact_name: v.contact_name ?? '',
      vat_number: v.vat_number ?? '',
      cr_number: v.cr_number ?? '',
      is_active: v.is_active ? 'true' : 'false',
    })))
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await readFileText(file)
      const rows = parseCSV(text)
      if (rows.length === 0) { alert('CSV had no data rows.'); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert('Not signed in.'); return }
      const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
      if (!profile?.organisation_id) { alert('No organisation.'); return }
      const payload = rows.filter(r => r.company_name).map(r => ({
        organisation_id: profile.organisation_id,
        company_name: r.company_name,
        company_name_ar: r.company_name_ar || null,
        // Accept either 'specialisation' or 'category' from the CSV (we used to export
        // 'category' before fixing the schema name). The DB column is 'specialisation'.
        specialisation: r.specialisation || r.category || null,
        email: r.email || null,
        phone: r.phone || null,
        // Accept either 'contact_name' or 'contact_person' from the CSV. DB column is
        // 'contact_name'.
        contact_name: r.contact_name || r.contact_person || null,
        vat_number: r.vat_number || null,
        cr_number: r.cr_number || null,
        is_active: r.is_active === 'false' ? false : true,
      }))
      if (payload.length === 0) { alert('No rows had a company_name to import.'); return }
      const { error } = await supabase.from('vendors').insert(payload)
      if (error) { alert('Import failed: ' + error.message); return }
      alert(`Imported ${payload.length} vendor(s).`)
      refresh()
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  function toggleSelect(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  function toggleSelectAll() { setSelected(selected.length === filtered.length ? [] : filtered.map(v => v.id)) }

  const activeCount = stats.active
  const ratedCount = stats.rated
  const avgRating = stats.avgRating

  function StarRating({ rating }: { rating: number }) {
    if (!rating) return <span className="text-on-surface-variant text-sm">—</span>
    return (
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={`material-symbols-outlined text-base ${i < Math.round(rating) ? 'text-[#f57f17]' : 'text-outline-variant'}`}
            style={{ fontVariationSettings: i < Math.round(rating) ? "'FILL' 1" : "'FILL' 0" }}>star</span>
        ))}
        <span className="text-xs text-on-surface-variant ml-1">{rating.toFixed(1)}</span>
      </div>
    )
  }

  function Initials({ name }: { name: string }) {
    const parts = (name ?? '?').split(' ')
    return <>{parts[0]?.[0]?.toUpperCase()}{parts[1]?.[0]?.toUpperCase() ?? ''}</>
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('vendors.title')}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{stats.total} {t('vendors.title').toLowerCase()} registered</p>
          </div>
          <div className="flex items-center gap-2">
            <input ref={importRef} type="file" accept=".csv,text/csv" onChange={handleImport} className="hidden" />
            <button onClick={() => importRef.current?.click()} className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-lg">upload</span>Import CSV
            </button>
            <button onClick={handleExport} className="bg-secondary/10 text-secondary px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-secondary/20 transition-colors">
              <span className="material-symbols-outlined text-lg">download</span>Export CSV
            </button>
            <Link href='/dashboard/vendors/new'>
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">add</span>{t('btn.add_vendor')}
              </button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: 'business', label: 'Total Vendors', value: stats.total, cls: 'bg-primary/10 text-primary', decor: 'bg-primary/5' },
            { icon: 'verified', label: 'Active Vendors', value: activeCount, cls: 'bg-primary/10 text-primary', decor: 'bg-primary/5' },
            { icon: 'star', label: 'Top Rated (4+)', value: ratedCount, cls: 'bg-[#f57f17]/10 text-[#f57f17]', decor: 'bg-[#f57f17]/5' },
            { icon: 'grade', label: 'Avg. Rating', value: avgRating, cls: 'bg-secondary/10 text-secondary', decor: 'bg-secondary/5' },
          ].map(s => (
            <div key={s.label} className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group">
              <div className={`absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 rounded-full group-hover:scale-110 transition-transform duration-500 ${s.decor}`} />
              <div className={`p-2 rounded-lg w-fit mb-3 ${s.cls}`}>
                <span className="material-symbols-outlined">{s.icon}</span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{s.label}</p>
              <p className="text-4xl font-bold text-on-surface">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-lg">search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('vendors.search')}
              className="w-full pl-9 pr-4 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
          </div>
        </div>

        {/* Bulk delete */}
        {selected.length > 0 && (
          <div className="bg-error/5 border border-error/20 rounded-xl p-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-error">{selected.length} {t('common.selected')}</span>
            <button onClick={deleteSelected} disabled={deleting}
              className="px-4 py-2 rounded-xl bg-error text-on-error text-sm font-semibold disabled:opacity-50 hover:bg-error/90 transition-colors">
              {deleting ? t('common.loading') : t('btn.delete_selected')}
            </button>
            <button onClick={() => setSelected([])} className="px-4 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-on-surface-variant py-8 text-center">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">business</span>
            <p className="text-lg font-semibold mb-1">No vendors found</p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container border-b border-outline-variant/30">
                    <th className="p-3 w-10">
                      <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded" />
                    </th>
                    {[t('vendors.col.company'), t('vendors.col.contact'), t('vendors.col.phone'), t('vendors.col.spec'), t('vendors.col.rating'), t('common.status'), t('common.actions')].map(h => (
                      <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.map(v => (
                    <tr key={v.id} className={`hover:bg-surface-container-low transition-colors ${selected.includes(v.id) ? 'bg-primary/5' : ''}`}>
                      <td className="p-3">
                        <input type='checkbox' checked={selected.includes(v.id)} onChange={() => toggleSelect(v.id)} className="rounded" />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-on-primary text-sm font-bold flex-shrink-0">
                            <Initials name={v.company_name} />
                          </div>
                          <div>
                            <Link href={'/dashboard/vendors/' + v.id} className="text-sm font-semibold text-primary hover:underline">{v.company_name}</Link>
                            {v.company_name_ar && <p className="text-xs text-on-surface-variant mt-0.5 font-medium" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>{v.company_name_ar}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{v.contact_name ?? '—'}</td>
                      <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{v.phone ?? '—'}</td>
                      <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{v.specialisation ?? '—'}</td>
                      <td className="p-3"><StarRating rating={v.average_rating} /></td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${v.is_active ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                          {v.is_active ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Link href={'/dashboard/vendors/' + v.id}>
                            <button className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.view')}</button>
                          </Link>
                          <Link href={'/dashboard/vendors/' + v.id + '/edit'}>
                            <button className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                          </Link>
                          <button onClick={() => toggleActive(v.id, v.is_active)}
                            className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">
                            {v.is_active ? t('common.deactivate') : t('common.activate')}
                          </button>
                          <button onClick={() => deleteOne(v.id)}
                            className="px-3 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">{t('common.delete')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && (
          <Pagination page={page} pageCount={pageCount} from={from} to={to} total={total}
            hasPrev={hasPrev} hasNext={hasNext} prev={prev} next={next} label={t('vendors.title').toLowerCase()} />
        )}
      </div>
    </div>
  )
}
