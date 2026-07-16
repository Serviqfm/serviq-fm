'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { exportCSV } from '@/lib/csv'
import { useLanguage } from '@/context/LanguageContext'
import {
  currentValue, isWarrantyExpiringSoon, isWarrantyExpired, isReviewDue,
  ASSET_LOG_STATUSES, type AssetLogStatus,
} from '@/lib/asset-log'

const STATUS_CLASSES: Record<string, string> = {
  in_storage:   'bg-surface-container-high text-on-surface-variant',
  in_use:       'bg-primary-container/90 text-on-primary-container',
  under_repair: 'bg-secondary-container/90 text-on-secondary-container',
  damaged:      'bg-error/10 text-error',
  disposed:     'bg-surface-container-high text-on-surface-variant/70',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = any

export default function AssetLogPage() {
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'

  const [items, setItems] = useState<Item[]>([])
  const [types, setTypes] = useState<Item[]>([])
  const [sites, setSites] = useState<Item[]>([])
  const [spaces, setSpaces] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | AssetLogStatus>('all')
  const [siteFilter, setSiteFilter] = useState('all')
  const [spaceFilter, setSpaceFilter] = useState('all')
  const [usableOnly, setUsableOnly] = useState(false)
  const [warrantyOnly, setWarrantyOnly] = useState(false)
  const [reviewDueOnly, setReviewDueOnly] = useState(false)
  const [includeDisposed, setIncludeDisposed] = useState(false)

  // AG-6 bulk QR label export
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [layout, setLayout] = useState<2 | 4 | 6>(4)
  const [exporting, setExporting] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [itemsRes, typesRes, sitesRes, spacesRes] = await Promise.all([
      supabase.from('asset_log_items')
        .select('*, type:type_id(id, name, name_ar, icon), site:site_id(id, name), space:space_id(id, name, floor)')
        .order('created_at', { ascending: false }),
      supabase.from('asset_log_types').select('id, name, name_ar').eq('is_active', true).order('name'),
      supabase.from('sites').select('id, name').order('name'),
      supabase.from('spaces').select('id, name, site_id').order('name'),
    ])
    if (itemsRes.data) setItems(itemsRes.data)
    if (typesRes.data) setTypes(typesRes.data)
    if (sitesRes.data) setSites(sitesRes.data)
    if (spacesRes.data) setSpaces(spacesRes.data)
    setLoading(false)
  }

  const spacesForSite = useMemo(
    () => siteFilter === 'all' ? spaces : spaces.filter(s => s.site_id === siteFilter),
    [spaces, siteFilter]
  )

  const filtered = useMemo(() => items.filter(it => {
    if (!includeDisposed && it.status === 'disposed') return false
    if (typeFilter !== 'all' && it.type_id !== typeFilter) return false
    if (statusFilter !== 'all' && it.status !== statusFilter) return false
    if (siteFilter !== 'all' && it.site_id !== siteFilter) return false
    if (spaceFilter !== 'all' && it.space_id !== spaceFilter) return false
    if (usableOnly && it.is_usable === false) return false
    if (warrantyOnly && !isWarrantyExpiringSoon(it.warranty_expiry) && !isWarrantyExpired(it.warranty_expiry)) return false
    if (reviewDueOnly && !isReviewDue(it)) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [
        it.name, it.name_ar, it.serial_number, it.brand,
        'AL-' + String(it.item_number).padStart(4, '0'),
      ].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [items, includeDisposed, typeFilter, statusFilter, siteFilter, spaceFilter, usableOnly, warrantyOnly, reviewDueOnly, search])

  // Stats over the non-disposed set (value excludes disposed).
  const stats = useMemo(() => {
    const live = items.filter(it => it.status !== 'disposed')
    const totalValue = live.reduce((sum, it) => sum + (currentValue(it) ?? 0), 0)
    return {
      total: live.length,
      value: totalValue,
      inUse: live.filter(it => it.status === 'in_use').length,
      repairDamaged: live.filter(it => it.status === 'under_repair' || it.status === 'damaged').length,
      warrantySoon: live.filter(it => isWarrantyExpiringSoon(it.warranty_expiry)).length,
    }
  }, [items])

  function clearFilters() {
    setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setSiteFilter('all')
    setSpaceFilter('all'); setUsableOnly(false); setWarrantyOnly(false); setReviewDueOnly(false)
  }

  const money = (n: number) => `SAR ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const al = (n: number) => 'AL-' + String(n).padStart(4, '0')
  const typeName = (it: Item) => it.type ? (isAr && it.type.name_ar ? it.type.name_ar : it.type.name) : '—'

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const allVisibleSelected = filtered.length > 0 && filtered.every(it => selected.has(it.id))
  function toggleAll() {
    setSelected(prev => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        filtered.forEach(it => next.delete(it.id))
        return next
      }
      const next = new Set(prev)
      filtered.forEach(it => next.add(it.id))
      return next
    })
  }

  async function exportQr() {
    if (selected.size === 0) return
    setExporting(true)
    try {
      const res = await fetch('/api/asset-log/export-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: Array.from(selected), layout }),
      })
      if (!res.ok) { alert(t('asset_log.qr_pdf_failed')); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'asset-log-qr.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  // Filter-aware CSV export. Columns mirror the import template so an export → import
  // round-trips (name/type/site/space by name, not id).
  function exportCsv() {
    const rows = filtered.map(it => ({
      name: it.name ?? '',
      name_ar: it.name_ar ?? '',
      description: it.description ?? '',
      type_name: it.type?.name ?? '',
      brand: it.brand ?? '',
      model: it.model ?? '',
      serial_number: it.serial_number ?? '',
      tracking_mode: it.tracking_mode ?? 'unit',
      quantity: it.quantity ?? 1,
      site_name: it.site?.name ?? '',
      space_name: it.space?.name ?? '',
      status: it.status ?? '',
      purchase_date: it.purchase_date ?? '',
      purchase_cost: it.purchase_cost ?? '',
      replacement_cost: it.replacement_cost ?? '',
      current_value_override: it.current_value_override ?? '',
      expected_lifespan_years: it.expected_lifespan_years ?? '',
      invoice_ref: it.invoice_ref ?? '',
      warranty_provider: it.warranty_provider ?? '',
      warranty_expiry: it.warranty_expiry ?? '',
      condition_rating: it.condition_rating ?? '',
      is_usable: it.is_usable === false ? 'false' : 'true',
      condition_notes: it.condition_notes ?? '',
      condition_review_interval_months: it.condition_review_interval_months ?? '',
    }))
    exportCSV('asset-log.csv', rows)
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-[1440px] mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('asset_log.title')}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{stats.total} {t('asset_log.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCsv} disabled={filtered.length === 0}
              className="bg-surface-container-lowest text-on-surface border border-outline-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors disabled:opacity-50">
              <span className="material-symbols-outlined text-lg">download</span>{t('common.export')}
            </button>
            <Link href="/dashboard/asset-log/reports">
              <button className="bg-surface-container-lowest text-on-surface border border-outline-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined text-lg">assessment</span>Reports
              </button>
            </Link>
            <Link href="/dashboard/asset-log/import">
              <button className="bg-surface-container-lowest text-on-surface border border-outline-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined text-lg">upload</span>{t('common.import')}
              </button>
            </Link>
            <Link href="/dashboard/asset-log/new">
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">add</span>{t('asset_log.new')}
              </button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: t('asset_log.stat.total'), value: String(stats.total), icon: 'inventory_2' },
            { label: t('asset_log.stat.value'), value: money(stats.value), icon: 'payments' },
            { label: t('asset_log.stat.in_use'), value: String(stats.inUse), icon: 'check_circle' },
            { label: t('asset_log.stat.repair'), value: String(stats.repairDamaged), icon: 'build' },
            { label: t('asset_log.stat.warranty'), value: String(stats.warrantySoon), icon: 'shield' },
          ].map(card => (
            <div key={card.label} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-on-surface-variant mb-1">
                <span className="material-symbols-outlined text-lg">{card.icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider">{card.label}</span>
              </div>
              <div className="text-2xl font-bold text-on-surface">{card.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* Filters */}
          <aside className="w-full lg:w-72 flex flex-col gap-4 flex-shrink-0">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{t('common.filters')}</span>
                <button onClick={clearFilters} className="text-xs text-primary font-bold hover:underline">{t('common.clear_all')}</button>
              </div>

              <div className="mb-5">
                <label className="block text-xs text-on-surface-variant mb-2">{t('common.search')}</label>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('asset_log.search')}
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/40 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
              </div>

              <div className="mb-5">
                <label className="block text-xs text-on-surface-variant mb-2">{t('asset_log.col.type')}</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/40 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="all">{t('common.all')}</option>
                  {types.map(ty => <option key={ty.id} value={ty.id}>{isAr && ty.name_ar ? ty.name_ar : ty.name}</option>)}
                </select>
              </div>

              <div className="mb-5">
                <label className="block text-xs text-on-surface-variant mb-2">{t('common.status')}</label>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${statusFilter === 'all' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container-low text-on-surface-variant border-transparent hover:border-outline-variant'}`}>
                    {t('common.all')}
                  </button>
                  {ASSET_LOG_STATUSES.map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${statusFilter === s ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container-low text-on-surface-variant border-transparent hover:border-outline-variant'}`}>
                      {t('asset_log.status.' + s)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-xs text-on-surface-variant mb-2">{t('common.site')}</label>
                <select value={siteFilter} onChange={e => { setSiteFilter(e.target.value); setSpaceFilter('all') }}
                  className="w-full px-3 py-2 mb-2 bg-surface-container-low border border-outline-variant/40 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="all">{t('common.all')}</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={spaceFilter} onChange={e => setSpaceFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/40 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="all">{t('asset_log.all_spaces')}</option>
                  {spacesForSite.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                {[
                  { checked: usableOnly, set: setUsableOnly, label: t('asset_log.filter.usable') },
                  { checked: warrantyOnly, set: setWarrantyOnly, label: t('asset_log.filter.warranty') },
                  { checked: reviewDueOnly, set: setReviewDueOnly, label: t('asset_log.filter.review_due') },
                  { checked: includeDisposed, set: setIncludeDisposed, label: t('asset_log.filter.include_disposed') },
                ].map((f, i) => (
                  <label key={i} className="flex items-center gap-3 cursor-pointer group">
                    <input type="checkbox" checked={f.checked} onChange={() => f.set(!f.checked)}
                      className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/30" />
                    <span className="text-sm text-on-surface group-hover:text-primary transition-colors">{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="text-on-surface-variant py-8 text-center">{t('common.loading')}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
                <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">list_alt</span>
                <p className="text-lg font-semibold mb-1">{t('asset_log.empty')}</p>
                <p className="text-sm">{t('asset_log.empty_hint')}</p>
              </div>
            ) : (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
                {selected.size > 0 && (
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-primary/5 border-b border-outline-variant/30">
                    <span className="text-sm font-semibold text-on-surface">{selected.size} {t('asset_log.selected')}</span>
                    <button onClick={() => setSelected(new Set())} className="text-xs text-primary font-bold hover:underline">{t('common.clear_all')}</button>
                    <div className={`flex items-center gap-2 ${isAr ? 'mr-auto' : 'ml-auto'}`}>
                      <label className="text-xs text-on-surface-variant">{t('asset_log.per_page')}</label>
                      <select value={layout} onChange={e => setLayout(Number(e.target.value) as 2 | 4 | 6)}
                        className="px-2 py-1.5 bg-surface-container-low border border-outline-variant/40 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30">
                        {[2, 4, 6].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <button onClick={exportQr} disabled={exporting}
                        className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-60">
                        <span className="material-symbols-outlined text-lg">qr_code_2</span>
                        {exporting ? t('common.loading') : t('asset_log.qr_pdf')}
                      </button>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-surface-container border-b border-outline-variant/30">
                        <th className="p-3 w-10">
                          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll}
                            className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/30" aria-label={t('common.select_all')} />
                        </th>
                        {[t('asset_log.col.number'), t('asset_log.col.name'), t('asset_log.col.type'), t('asset_log.col.location'),
                          t('asset_log.col.qty'), t('common.status'), t('asset_log.col.condition'), t('asset_log.col.value'), t('asset_log.col.warranty')].map(h => (
                          <th key={h} className={`p-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap ${isAr ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {filtered.map(it => {
                        const soon = isWarrantyExpiringSoon(it.warranty_expiry)
                        const expired = isWarrantyExpired(it.warranty_expiry)
                        const val = currentValue(it)
                        const loc = it.space
                          ? `${it.site?.name ?? '—'} → ${it.space.name}`
                          : (it.site?.name ?? t('asset_log.unassigned'))
                        return (
                          <tr key={it.id} className="hover:bg-surface-container-low transition-colors">
                            <td className="p-3 w-10">
                              <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleOne(it.id)}
                                className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary/30" aria-label={al(it.item_number)} />
                            </td>
                            <td className="p-3 text-xs font-mono text-on-surface-variant whitespace-nowrap">{al(it.item_number)}</td>
                            <td className="p-3">
                              <Link href={'/dashboard/asset-log/' + it.id} className="text-sm font-semibold text-primary hover:underline">{it.name}</Link>
                              {it.name_ar && <p className="text-xs text-on-surface-variant mt-0.5" dir="rtl">{it.name_ar}</p>}
                              {it.serial_number && <p className="text-xs text-on-surface-variant/70 mt-0.5 font-mono">SN: {it.serial_number}</p>}
                            </td>
                            <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{typeName(it)}</td>
                            <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{loc}</td>
                            <td className="p-3 text-sm text-on-surface-variant">{it.quantity}{it.tracking_mode === 'bulk' ? ' (bulk)' : ''}</td>
                            <td className="p-3">
                              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_CLASSES[it.status] ?? STATUS_CLASSES.in_storage}`}>
                                {t('asset_log.status.' + it.status)}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {it.condition_rating ? (
                                <span className="text-sm text-[#f57f17]" title={`${it.condition_rating}/5`}>
                                  {'★'.repeat(it.condition_rating)}{'☆'.repeat(5 - it.condition_rating)}
                                </span>
                              ) : <span className="text-sm text-on-surface-variant">—</span>}
                              {it.is_usable === false && (
                                <span className="ml-1 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-error/10 text-error">{t('asset_log.not_usable')}</span>
                              )}
                            </td>
                            <td className="p-3 text-sm text-on-surface whitespace-nowrap">{val != null ? money(val) : '—'}</td>
                            <td className={`p-3 text-sm whitespace-nowrap ${expired ? 'text-error font-semibold' : soon ? 'text-[#f57f17] font-semibold' : 'text-on-surface-variant'}`}>
                              {it.warranty_expiry
                                ? `${it.warranty_expiry}${expired ? ` (${t('asset_log.expired')})` : soon ? ` (${t('asset_log.soon')})` : ''}`
                                : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
