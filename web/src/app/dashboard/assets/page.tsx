'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { usePagination } from '@/lib/usePagination'
import Pagination from '@/components/Pagination'
import { getDescendantIds } from './asset-hierarchy'

const CATEGORIES = ['HVAC','Electrical','Plumbing','Elevator / Lift','Fire Safety','Furniture','Kitchen Equipment','Pool / Gym','IT Equipment','Signage','Vehicle','Other']

const CATEGORY_ICONS: Record<string, string> = {
  'HVAC': 'ac_unit',
  'Electrical': 'electrical_services',
  'Plumbing': 'water_pump',
  'Elevator / Lift': 'elevator',
  'Fire Safety': 'fire_extinguisher',
  'Furniture': 'chair',
  'Kitchen Equipment': 'kitchen',
  'Pool / Gym': 'pool',
  'IT Equipment': 'computer',
  'Signage': 'signpost',
  'Vehicle': 'directions_car',
  'Other': 'category',
}

const STATUS_CLASSES: Record<string, string> = {
  active:            'bg-primary-container/90 text-on-primary-container',
  under_maintenance: 'bg-secondary-container/90 text-on-secondary-container',
  retired:           'bg-surface-container-high text-on-surface-variant',
}

export default function AssetsPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  // AL-03: asset ids with an OPEN asset_downtime period → red "not operational" badge.
  const [downAssets, setDownAssets] = useState<Set<string>>(new Set())
  const supabase = createClient()
  const { t } = useLanguage()

  // Debounce search so we don't fire a query on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { rows: assets, total, loading, page, pageCount, from, to, hasPrev, hasNext, prev, next, refresh } = usePagination<any>(
    () => {
      let q = supabase.from('assets').select('*, site:site_id(name), parent:parent_asset_id(name)', { count: 'exact' })
        .order('created_at', { ascending: false })
      if (statusFilter !== 'all') q = q.eq('status', statusFilter)
      if (categoryFilter !== 'all') q = q.eq('category', categoryFilter)
      if (debouncedSearch) {
        const s = `%${debouncedSearch}%`
        q = q.or(`name.ilike.${s},serial_number.ilike.${s},manufacturer.ilike.${s}`)
      }
      return q
    },
    [statusFilter, categoryFilter, debouncedSearch],
  )

  // AL-03: flag assets that currently have an open downtime period. `assets` is a
  // stable ref between page loads (usePagination), so this only re-runs per page.
  useEffect(() => {
    const ids = assets.map(a => a.id)
    if (ids.length === 0) { setDownAssets(new Set()); return }
    let cancelled = false
    supabase.from('asset_downtime').select('asset_id').is('ended_at', null).in('asset_id', ids)
      .then(({ data }) => { if (!cancelled) setDownAssets(new Set((data ?? []).map((r: { asset_id: string }) => r.asset_id))) })
    return () => { cancelled = true }
  }, [assets, supabase])

  // AL-01: deleting a parent silently promoted its children to top level
  // (parent_asset_id is ON DELETE SET NULL). Surface the descendants and make
  // cascade-vs-promote an explicit choice. Fetches the full org hierarchy fresh —
  // the page's `assets` state is filtered by the UI filters and could miss children.
  async function resolveDeleteSet(ids: string[]): Promise<string[] | null> {
    const { data: allAssets } = await supabase.from('assets').select('id, name, parent_asset_id')
    const tree = allAssets ?? assets
    const descendants = new Set<string>()
    for (const id of ids) getDescendantIds(tree, id).forEach(d => descendants.add(d))
    ids.forEach(id => descendants.delete(id))
    if (descendants.size === 0) {
      return confirm(`Delete ${ids.length} asset(s)? This cannot be undone.`) ? ids : null
    }
    if (confirm(`The selected asset(s) have ${descendants.size} sub-asset(s) underneath them.\n\nOK = delete the sub-assets too (cascade)\nCancel = choose what happens to them`)) {
      return [...ids, ...Array.from(descendants)]
    }
    if (confirm(`Keep the ${descendants.size} sub-asset(s) and promote them to top level, deleting only the selected asset(s)?`)) {
      return ids
    }
    return null
  }

  async function deleteSelected() {
    const toDelete = await resolveDeleteSet(selected)
    if (!toDelete) return
    setDeleting(true)
    await supabase.from('assets').delete().in('id', toDelete)
    setSelected([])
    refresh()
    setDeleting(false)
  }

  async function exportSelectedQR(layout: 2 | 4 | 6) {
    if (selected.length === 0) return
    const res = await fetch('/api/assets/export-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetIds: selected, layout }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert('QR export failed: ' + (err.error ?? res.statusText))
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `asset-qr-codes-${new Date().toISOString().slice(0, 10)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function deleteOne(id: string) {
    const toDelete = await resolveDeleteSet([id])
    if (!toDelete) return
    await supabase.from('assets').delete().in('id', toDelete)
    refresh()
  }

  function toggleSelect(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  const isWarrantyExpiringSoon = (date: string) => {
    if (!date) return false
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
    return days <= 30 && days >= 0
  }
  const isWarrantyExpired = (date: string) => !!date && new Date(date) < new Date()

  // Current page is already server-filtered; render it directly.
  const filtered = assets

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('assets.title')}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{total} total assets registered</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-surface-container rounded-lg p-1">
              <button onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${viewMode === 'grid' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}>
                <span className="material-symbols-outlined text-base" style={viewMode === 'grid' ? { fontVariationSettings: "'FILL' 1" } : {}}>grid_view</span>Grid
              </button>
              <button onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${viewMode === 'list' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-primary'}`}>
                <span className="material-symbols-outlined text-base">list</span>List
              </button>
            </div>
            <Link href='/dashboard/assets/import'>
              <button className="px-4 py-2 rounded-xl border border-outline-variant/40 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('btn.import')}</button>
            </Link>
            <Link href='/dashboard/assets/export'>
              <button className="px-4 py-2 rounded-xl border border-outline-variant/40 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('btn.export')}</button>
            </Link>
            <Link href='/dashboard/assets/new'>
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">add</span>{t('btn.add_asset')}
              </button>
            </Link>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* Filter Sidebar */}
          <aside className="w-full lg:w-72 flex flex-col gap-4 flex-shrink-0">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Filters</span>
                <button onClick={() => { setCategoryFilter('all'); setStatusFilter('all'); setSearch('') }} className="text-xs text-primary font-bold hover:underline">Clear All</button>
              </div>

              {/* Search */}
              <div className="mb-5">
                <label className="block text-xs text-on-surface-variant mb-2">Search</label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-lg">search</span>
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('assets.search')}
                    className="w-full pl-9 pr-3 py-2 bg-surface-container-low border border-outline-variant/40 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
                </div>
              </div>

              {/* Category */}
              <div className="mb-5">
                <label className="block text-xs text-on-surface-variant mb-2">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => setCategoryFilter('all')}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${categoryFilter === 'all' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container-low text-on-surface-variant border-transparent hover:border-outline-variant'}`}>
                    All
                  </button>
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCategoryFilter(c)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${categoryFilter === c ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container-low text-on-surface-variant border-transparent hover:border-outline-variant'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs text-on-surface-variant mb-2">Asset Status</label>
                <div className="space-y-2">
                  {[
                    { val: 'all', label: 'All' },
                    { val: 'active', label: t('assets.status.active') },
                    { val: 'under_maintenance', label: t('assets.status.under_maintenance') },
                    { val: 'retired', label: 'Retired/Decommissioned' },
                  ].map(opt => (
                    <label key={opt.val} className="flex items-center gap-3 cursor-pointer group">
                      <input type="radio" checked={statusFilter === opt.val} onChange={() => setStatusFilter(opt.val)}
                        className="w-4 h-4 border-outline-variant text-primary focus:ring-primary/30" />
                      <span className="text-sm text-on-surface group-hover:text-primary transition-colors">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* IoT promo card */}
            <div className="bg-secondary text-on-secondary p-4 rounded-xl shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
              <h5 className="font-bold mb-1 relative z-10">Smart Monitoring</h5>
              <p className="text-xs opacity-90 mb-4 relative z-10">Connect IoT sensors to automate maintenance logs.</p>
              <button className="w-full py-2 bg-secondary-fixed text-on-secondary-fixed rounded-lg text-xs font-bold hover:bg-white transition-all relative z-10">Enable Now</button>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Bulk actions bar */}
            {selected.length > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-3 mb-4 flex-wrap">
                <span className="text-sm font-semibold text-primary">{selected.length} asset(s) selected</span>
                <button onClick={() => exportSelectedQR(2)} className="px-4 py-1.5 rounded-xl bg-secondary/10 text-secondary text-sm font-semibold hover:bg-secondary/20 transition-colors">QR PDF (2/page)</button>
                <button onClick={() => exportSelectedQR(4)} className="px-4 py-1.5 rounded-xl bg-secondary/10 text-secondary text-sm font-semibold hover:bg-secondary/20 transition-colors">QR PDF (4/page)</button>
                <button onClick={() => exportSelectedQR(6)} className="px-4 py-1.5 rounded-xl bg-secondary/10 text-secondary text-sm font-semibold hover:bg-secondary/20 transition-colors">QR PDF (6/page)</button>
                <button onClick={deleteSelected} disabled={deleting}
                  className="px-4 py-1.5 rounded-xl bg-error text-on-error text-sm font-semibold disabled:opacity-50 hover:bg-error/90 transition-colors">
                  {deleting ? 'Deleting...' : t('btn.delete_selected')}
                </button>
                <button onClick={() => setSelected([])} className="px-4 py-1.5 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">Cancel</button>
              </div>
            )}

            {loading ? (
              <div className="text-on-surface-variant py-8 text-center">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
                <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">inventory_2</span>
                <p className="text-lg font-semibold mb-1">No assets found</p>
                <p className="text-sm">Add your first asset to get started</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(asset => {
                  const icon = CATEGORY_ICONS[asset.category] ?? 'category'
                  const statusCls = STATUS_CLASSES[asset.status] ?? STATUS_CLASSES.active
                  const warningSoon = isWarrantyExpiringSoon(asset.warranty_expiry)
                  const expired = isWarrantyExpired(asset.warranty_expiry)
                  const isSelected = selected.includes(asset.id)
                  return (
                    <div key={asset.id}
                      className={`bg-surface-container-lowest rounded-xl border overflow-hidden group hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 flex flex-col ${isSelected ? 'border-primary' : 'border-outline-variant'}`}
                    >
                      {/* Card image / icon area */}
                      <div className="relative h-36 bg-gradient-to-br from-surface-container-low to-surface-container flex items-center justify-center overflow-hidden">
                        <span className="material-symbols-outlined text-7xl text-outline-variant/30 group-hover:scale-110 transition-transform duration-500" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                        <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
                          <div className={`backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${statusCls}`}>
                            {asset.status?.replace('_', ' ') ?? 'active'}
                          </div>
                          {downAssets.has(asset.id) && (
                            <div className="flex items-center gap-1 backdrop-blur bg-error/90 text-on-error px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm">
                              <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>Not Operational
                            </div>
                          )}
                        </div>
                        <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/dashboard/assets/${asset.id}/edit`}>
                            <button className="p-2 bg-white/90 rounded-full text-primary shadow-sm hover:bg-primary hover:text-white transition-colors" onClick={e => e.stopPropagation()}>
                              <span className="material-symbols-outlined text-xl">edit</span>
                            </button>
                          </Link>
                        </div>
                        <label className="absolute bottom-2 left-2 cursor-pointer" onClick={e => { e.stopPropagation() }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(asset.id)} className="w-4 h-4 rounded border-outline-variant text-primary" />
                        </label>
                      </div>

                      {/* Card body */}
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="mb-3">
                          <span className="text-[10px] font-bold uppercase tracking-tighter text-primary">
                            {asset.category ?? 'Asset'}{asset.site?.name ? ` · ${asset.site.name}` : ''}
                          </span>
                          <h4 className="font-bold text-on-surface text-base leading-tight mt-1">{asset.name}</h4>
                          {asset.serial_number && <p className="text-on-surface-variant text-xs mt-0.5 font-mono">SN: {asset.serial_number}</p>}
                        </div>

                        <div className="mt-auto flex items-center justify-between pt-3 border-t border-outline-variant/30">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary">
                              <span className="material-symbols-outlined text-lg">
                                {expired ? 'warning' : warningSoon ? 'schedule' : 'verified'}
                              </span>
                            </div>
                            <div className="text-[10px]">
                              <p className="text-on-surface-variant font-medium">
                                {asset.warranty_expiry ? 'Warranty' : 'Added'}
                              </p>
                              <p className={`font-bold ${expired ? 'text-error' : warningSoon ? 'text-[#f57f17]' : 'text-on-surface'}`}>
                                {asset.warranty_expiry ? format(new Date(asset.warranty_expiry), 'dd MMM yyyy') : format(new Date(asset.created_at), 'dd MMM yyyy')}
                                {expired && ' (Exp)'}
                                {warningSoon && !expired && ' (Soon)'}
                              </p>
                            </div>
                          </div>
                          <Link href={`/dashboard/assets/${asset.id}`}>
                            <button className="px-4 py-2 bg-surface-container-low text-primary rounded-lg text-xs font-bold hover:bg-primary-container/20 hover:text-on-primary-container transition-all">
                              Details
                            </button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* List / table view */
              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-surface-container border-b border-outline-variant/30">
                        <th className="p-3 w-10">
                          <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0}
                            onChange={() => setSelected(selected.length === filtered.length ? [] : filtered.map(a => a.id))} className="rounded" />
                        </th>
                        {[t('assets.col.name'), t('assets.col.cat'), t('common.site'), t('assets.col.serial'), t('common.status'), t('assets.col.warranty'), t('assets.col.added'), t('common.actions')].map(h => (
                          <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {filtered.map(asset => {
                        const warningSoon = isWarrantyExpiringSoon(asset.warranty_expiry)
                        const expired = isWarrantyExpired(asset.warranty_expiry)
                        const isSelected = selected.includes(asset.id)
                        return (
                          <tr key={asset.id} className={`hover:bg-surface-container-low transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                            <td className="p-3"><input type='checkbox' checked={isSelected} onChange={() => toggleSelect(asset.id)} className="rounded" /></td>
                            <td className="p-3">
                              <Link href={'/dashboard/assets/' + asset.id} className="text-sm font-semibold text-primary hover:underline">{asset.name}</Link>
                              {asset.parent?.name && <p className="text-xs text-on-surface-variant/70 mt-0.5">↳ {asset.parent.name}</p>}
                              {asset.manufacturer && <p className="text-xs text-on-surface-variant mt-0.5">{asset.manufacturer} {asset.model}</p>}
                            </td>
                            <td className="p-3 text-sm text-on-surface-variant">{asset.category ?? '—'}</td>
                            <td className="p-3 text-sm text-on-surface-variant">{asset.site?.name ?? '—'}</td>
                            <td className="p-3 text-xs font-mono text-on-surface-variant">{asset.serial_number ?? '—'}</td>
                            <td className="p-3">
                              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASSES[asset.status] ?? STATUS_CLASSES.active}`}>
                                {asset.status?.replace('_', ' ') ?? 'active'}
                              </span>
                              {downAssets.has(asset.id) && (
                                <span className="mt-1 flex items-center gap-1 w-fit px-2.5 py-0.5 rounded-full text-xs font-semibold bg-error/10 text-error">
                                  <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>Not Operational
                                </span>
                              )}
                            </td>
                            <td className={`p-3 text-sm ${expired ? 'text-error font-semibold' : warningSoon ? 'text-[#f57f17] font-semibold' : 'text-on-surface-variant'}`}>
                              {asset.warranty_expiry ? `${format(new Date(asset.warranty_expiry), 'dd MMM yyyy')}${expired ? ' (Expired)' : warningSoon ? ' (Soon)' : ''}` : '—'}
                            </td>
                            <td className="p-3 text-sm text-on-surface-variant">{format(new Date(asset.created_at), 'dd MMM yyyy')}</td>
                            <td className="p-3">
                              <div className="flex gap-2">
                                <Link href={'/dashboard/assets/' + asset.id + '/edit'}>
                                  <button className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                                </Link>
                                <button onClick={() => deleteOne(asset.id)} className="px-3 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">{t('common.delete')}</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!loading && (
              <Pagination page={page} pageCount={pageCount} from={from} to={to} total={total}
                hasPrev={hasPrev} hasNext={hasNext} prev={prev} next={next} label="assets" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
