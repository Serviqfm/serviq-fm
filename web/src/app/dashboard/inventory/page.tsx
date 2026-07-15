'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { usePagination } from '@/lib/usePagination'
import Pagination from '@/components/Pagination'
import Link from 'next/link'

export default function InventoryPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'in' | 'low' | 'out'>('all')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  // Org-wide KPI aggregates (whole table, not just the current page).
  const [kpis, setKpis] = useState({ total: 0, lowStock: 0, outOfStock: 0, totalValue: 0 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [lowStockItems, setLowStockItems] = useState<any[]>([])
  const supabase = createClient()
  const { t } = useLanguage()

  // Debounce search so we don't fire a query on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        if (typeof window !== 'undefined') window.location.href = '/login'
        return
      }
      const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
      if (profile) setOrgId(profile.organisation_id)
    })
  }, [supabase])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { rows: items, total, loading, page, pageCount, from, to, hasPrev, hasNext, prev, next, refresh } = usePagination<any>(
    () => {
      let q = supabase.from('inventory_items').select('*, site:site_id(name)', { count: 'exact' })
        .eq('organisation_id', orgId!).order('name', { ascending: true })
      if (debouncedSearch) {
        const s = `%${debouncedSearch}%`
        q = q.or(`name.ilike.${s},sku.ilike.${s},category.ilike.${s}`)
      }
      if (filterCategory) q = q.eq('category', filterCategory)
      if (filterStatus === 'out') q = q.eq('stock_quantity', 0)
      if (filterStatus === 'in') q = q.gt('stock_quantity', 0)
      // 'low' can't be expressed as a single column filter (needs stock <= min_level);
      // ponytail: approximate as a low absolute stock threshold, exact filter would need an RPC.
      if (filterStatus === 'low') q = q.gt('stock_quantity', 0).lte('stock_quantity', 10)
      return q
    },
    [orgId, debouncedSearch, filterCategory, filterStatus],
  )

  // KPIs + distinct categories + low-stock list: whole-org, refreshed on delete.
  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    supabase.from('inventory_items')
      .select('category, stock_quantity, minimum_stock_level, unit_cost, id, name, unit')
      .eq('organisation_id', orgId)
      .then(({ data }) => {
        if (cancelled || !data) return
        setCategories(Array.from(new Set(data.map(i => i.category).filter(Boolean))).sort() as string[])
        const low = data.filter(i => i.stock_quantity <= i.minimum_stock_level && i.minimum_stock_level > 0)
        setLowStockItems(low)
        setKpis({
          total: data.length,
          lowStock: low.length,
          outOfStock: data.filter(i => i.stock_quantity === 0).length,
          totalValue: data.reduce((sum, i) => sum + (i.stock_quantity * (i.unit_cost ?? 0)), 0),
        })
      })
    return () => { cancelled = true }
  }, [orgId, deleting, supabase])

  async function deleteSelected() {
    if (!confirm(t('common.confirm_delete') + ' (' + selected.length + ')')) return
    setDeleting(true)
    await supabase.from('inventory_items').delete().in('id', selected)
    setSelected([])
    refresh()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('inventory_items').delete().eq('id', id)
    refresh()
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelected(prev => prev.length === items.length ? [] : items.map(i => i.id))
  }

  // Current page is already server-filtered; render it directly.
  const filtered = items

  // Export the full org list, not just the current page.
  async function exportCSV() {
    if (!orgId) return
    const { data: allItems } = await supabase.from('inventory_items')
      .select('name, name_ar, sku, category, unit, stock_quantity, minimum_stock_level, unit_cost, site:site_id(name)')
      .eq('organisation_id', orgId).order('name', { ascending: true })
    if (!allItems || allItems.length === 0) {
      alert('Nothing to export.')
      return
    }
    const cols = ['name', 'name_ar', 'sku', 'category', 'unit', 'stock_quantity', 'minimum_stock_level', 'unit_cost', 'site']
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return ''
      const s = typeof v === 'string' ? v : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (allItems as any[]).map(i => ({
      name: i.name ?? '',
      name_ar: i.name_ar ?? '',
      sku: i.sku ?? '',
      category: i.category ?? '',
      unit: i.unit ?? '',
      stock_quantity: i.stock_quantity ?? 0,
      minimum_stock_level: i.minimum_stock_level ?? 0,
      unit_cost: i.unit_cost ?? '',
      site: i.site?.name ?? '',
    }))
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc((r as Record<string, unknown>)[c])).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function stockStatus(item: any) {
    if (item.stock_quantity === 0) return { label: t('inv.status.out'), cls: 'bg-error/10 text-error border border-error/20' }
    if (item.stock_quantity <= item.minimum_stock_level && item.minimum_stock_level > 0) return { label: t('inv.status.low'), cls: 'bg-[#f57f17]/10 text-[#f57f17] border border-[#f57f17]/20' }
    return { label: t('inv.status.in'), cls: 'bg-primary/10 text-primary border border-primary/20' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function stockBarColor(item: any) {
    if (item.stock_quantity === 0) return 'bg-error'
    if (item.stock_quantity <= item.minimum_stock_level && item.minimum_stock_level > 0) return 'bg-[#f57f17]'
    return 'bg-primary/60'
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function stockBarWidth(item: any) {
    if (!item.minimum_stock_level) return '50%'
    const pct = Math.min(100, Math.round((item.stock_quantity / (item.minimum_stock_level * 2)) * 100))
    return `${pct}%`
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('inv.title')}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {kpis.total} {t('inv.title').toLowerCase()}
              {kpis.lowStock > 0 && <span className="text-error ml-2">· {kpis.lowStock} {t('inv.status.low')}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/inventory/ledger"
              className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-colors text-sm font-semibold">
              <span className="material-symbols-outlined text-base">receipt_long</span>Stock Ledger
            </Link>
            <Link href="/dashboard/purchase-orders"
              className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-colors text-sm font-semibold">
              <span className="material-symbols-outlined text-base">shopping_cart</span>Purchase Orders
            </Link>
            <Link href="/dashboard/inventory/new">
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">add</span>{t('btn.add_item')}
              </button>
            </Link>
          </div>
        </div>

        {/* KPI bento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 relative overflow-hidden group shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 64 }}>payments</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Total Value (SAR)</p>
            <p className="text-4xl font-bold text-primary">{kpis.totalValue > 0 ? kpis.totalValue.toLocaleString('en-SA', { maximumFractionDigits: 0 }) : kpis.total}</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 relative overflow-hidden group shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-error" style={{ fontSize: 64 }}>warning</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Low Stock Items</p>
            <p className="text-4xl font-bold text-error">{kpis.lowStock}</p>
            {kpis.outOfStock > 0 && <p className="text-xs text-error font-semibold mt-3">{kpis.outOfStock} out of stock</p>}
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 relative overflow-hidden group shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-secondary" style={{ fontSize: 64 }}>local_shipping</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Total Items</p>
            <p className="text-4xl font-bold text-secondary">{kpis.total}</p>
          </div>
        </div>

        {/* Low stock alert */}
        {lowStockItems.length > 0 && (
          <div className="bg-error/5 border border-error/20 rounded-xl p-4">
            <p className="text-sm font-bold text-error mb-2">{t('inv.low_stock')}</p>
            <div className="flex gap-2 flex-wrap">
              {lowStockItems.map(i => (
                <Link key={i.id} href={'/dashboard/inventory/' + i.id}>
                  <span className="text-xs bg-surface-container-lowest border border-error/30 text-error px-3 py-1 rounded-lg cursor-pointer hover:bg-error/5 transition-colors">
                    {i.name} ({i.stock_quantity} {i.unit})
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Search + bulk actions */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative max-w-md w-full">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-lg">search</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inv.search')}
                className="w-full pl-9 pr-4 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFilters(s => !s)}
                className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-colors text-sm ${showFilters ? 'bg-primary/10 text-primary border-primary/40' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}>
                <span className="material-symbols-outlined text-base">filter_list</span>Filter{(filterCategory || filterStatus !== 'all') ? ` (${[filterCategory, filterStatus !== 'all' ? filterStatus : null].filter(Boolean).length})` : ''}
              </button>
              <Link href="/dashboard/inventory/import"
                className="flex items-center gap-2 px-4 py-2 border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-colors text-sm">
                <span className="material-symbols-outlined text-base">upload</span>Import
              </Link>
              <button onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-secondary/10 text-secondary rounded-xl font-semibold hover:bg-secondary/20 transition-colors text-sm">
                <span className="material-symbols-outlined text-base">download</span>Export
              </button>
            </div>
          </div>
          {showFilters && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-outline-variant/30">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Category</label>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm">
                  <option value="">All categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Stock status</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'all' | 'in' | 'low' | 'out')}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm">
                  <option value="all">All</option>
                  <option value="in">In stock</option>
                  <option value="low">Low stock</option>
                  <option value="out">Out of stock</option>
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={() => { setFilterCategory(''); setFilterStatus('all') }}
                  className="px-3 py-2 rounded-xl border border-outline-variant/40 text-on-surface-variant text-sm hover:bg-surface-container-low transition-colors">
                  Clear filters
                </button>
              </div>
            </div>
          )}
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
          <div className="text-center py-16 text-on-surface-variant">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">inventory_2</span>
            <p className="text-lg font-semibold mb-1">{t('inv.title')}</p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    <th className="px-4 py-4 w-10">
                      <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="rounded" />
                    </th>
                    {[t('inv.col.name'), t('inv.col.cat'), t('inv.col.stock'), t('inv.col.cost'), t('common.status'), t('common.actions')].map(h => (
                      <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.map(item => {
                    const { label, cls } = stockStatus(item)
                    return (
                      <tr key={item.id} className={`hover:bg-surface-container-low transition-colors ${selected.includes(item.id) ? 'bg-primary/5' : ''}`}>
                        <td className="px-4 py-4">
                          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} className="rounded" />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                              <span className="material-symbols-outlined text-lg">inventory_2</span>
                            </div>
                            <div>
                              <Link href={'/dashboard/inventory/' + item.id} className="text-sm font-semibold text-primary hover:underline">{item.name}</Link>
                              {item.sku && <p className="text-xs text-on-surface-variant mt-0.5">SKU: {item.sku}</p>}
                              {item.name_ar && <p className="text-xs text-on-surface-variant mt-0.5" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>{item.name_ar}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-on-surface-variant whitespace-nowrap">{item.category ?? '—'}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col items-start gap-1">
                            <span className={`text-sm font-bold ${item.stock_quantity === 0 ? 'text-error' : item.stock_quantity <= item.minimum_stock_level ? 'text-[#f57f17]' : 'text-on-surface'}`}>
                              {item.stock_quantity} {item.unit}
                            </span>
                            <div className="w-20 h-1.5 bg-surface-container-high rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${stockBarColor(item)}`} style={{ width: stockBarWidth(item) }} />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-on-surface-variant whitespace-nowrap">
                          {item.unit_cost ? 'SAR ' + Number(item.unit_cost).toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <Link href={'/dashboard/inventory/' + item.id + '/edit'}>
                              <button className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                            </Link>
                            <button onClick={() => deleteOne(item.id)}
                              className="px-3 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">{t('common.delete')}</button>
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
            hasPrev={hasPrev} hasNext={hasNext} prev={prev} next={next} label={t('inv.title').toLowerCase()} />
        )}

      </div>
    </div>
  )
}
