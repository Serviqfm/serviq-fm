'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'
import { parseCSV, readFileText } from '@/lib/csv'

export default function InventoryPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'in' | 'low' | 'out'>('all')
  const supabase = createClient()
  const { t } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      if (typeof window !== 'undefined') window.location.href = '/login'
      return
    }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data } = await supabase.from('inventory_items').select('*, site:site_id(name)').eq('organisation_id', profile.organisation_id).order('name', { ascending: true })
    if (data) setItems(data)
    setLoading(false)
  }

  async function deleteSelected() {
    if (!confirm(t('common.confirm_delete') + ' (' + selected.length + ')')) return
    setDeleting(true)
    await supabase.from('inventory_items').delete().in('id', selected)
    setSelected([])
    await fetchItems()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('inventory_items').delete().eq('id', id)
    fetchItems()
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelected(prev => prev.length === filtered.length ? [] : filtered.map(i => i.id))
  }

  const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort() as string[]

  function statusOf(i: { stock_quantity: number; minimum_stock_level: number }): 'in' | 'low' | 'out' {
    if (i.stock_quantity === 0) return 'out'
    if (i.stock_quantity <= i.minimum_stock_level && i.minimum_stock_level > 0) return 'low'
    return 'in'
  }

  const filtered = items.filter(i => {
    const matchesSearch = !search ||
      i.name?.toLowerCase().includes(search.toLowerCase()) ||
      i.sku?.toLowerCase().includes(search.toLowerCase()) ||
      i.category?.toLowerCase().includes(search.toLowerCase())
    const matchesCat = !filterCategory || i.category === filterCategory
    const matchesStatus = filterStatus === 'all' || statusOf(i) === filterStatus
    return matchesSearch && matchesCat && matchesStatus
  })

  const importRef = useRef<HTMLInputElement>(null)
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
        sku: r.sku || null,
        category: r.category || null,
        unit: r.unit || 'pcs',
        stock_quantity: r.stock_quantity ? Number(r.stock_quantity) : 0,
        minimum_stock_level: r.minimum_stock_level ? Number(r.minimum_stock_level) : 0,
        unit_cost: r.unit_cost ? Number(r.unit_cost) : null,
      }))
      if (payload.length === 0) { alert('No rows had a name to import.'); return }
      const { error } = await supabase.from('inventory_items').insert(payload)
      if (error) { alert('Import failed: ' + error.message); return }
      alert(`Imported ${payload.length} item(s).`)
      fetchItems()
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  function exportCSV() {
    if (filtered.length === 0) {
      alert('Nothing to export.')
      return
    }
    const cols = ['name', 'name_ar', 'sku', 'category', 'unit', 'stock_quantity', 'minimum_stock_level', 'unit_cost', 'site']
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return ''
      const s = typeof v === 'string' ? v : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }
    const rows = filtered.map(i => ({
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

  const lowStockItems = items.filter(i => i.stock_quantity <= i.minimum_stock_level && i.minimum_stock_level > 0)
  const outOfStockCount = items.filter(i => i.stock_quantity === 0).length
  const totalValue = items.reduce((sum, i) => sum + (i.stock_quantity * (i.unit_cost ?? 0)), 0)

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

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('inv.title')}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {items.length} {t('inv.title').toLowerCase()}
              {lowStockItems.length > 0 && <span className="text-error ml-2">· {lowStockItems.length} {t('inv.status.low')}</span>}
            </p>
          </div>
          <Link href="/dashboard/inventory/new">
            <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
              <span className="material-symbols-outlined text-lg">add</span>{t('btn.add_item')}
            </button>
          </Link>
        </div>

        {/* KPI bento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 relative overflow-hidden group shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 64 }}>payments</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Total Value (SAR)</p>
            <p className="text-4xl font-bold text-primary">{totalValue > 0 ? totalValue.toLocaleString('en-SA', { maximumFractionDigits: 0 }) : items.length}</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 relative overflow-hidden group shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-error" style={{ fontSize: 64 }}>warning</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Low Stock Items</p>
            <p className="text-4xl font-bold text-error">{lowStockItems.length}</p>
            {outOfStockCount > 0 && <p className="text-xs text-error font-semibold mt-3">{outOfStockCount} out of stock</p>}
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 relative overflow-hidden group shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-secondary" style={{ fontSize: 64 }}>local_shipping</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">Total Items</p>
            <p className="text-4xl font-bold text-secondary">{items.length}</p>
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
              <input ref={importRef} type="file" accept=".csv,text/csv" onChange={handleImport} className="hidden" />
              <button onClick={() => importRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-colors text-sm">
                <span className="material-symbols-outlined text-base">upload</span>Import
              </button>
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
        {filtered.length === 0 ? (
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

      </div>
    </div>
  )
}
