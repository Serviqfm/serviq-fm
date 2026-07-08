'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isAfter } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

interface Technician { id: string; full_name: string }

interface WorkOrder {
  id: string
  wo_number: number
  title: string
  status: string
  priority: string
  category?: string
  created_at: string
  updated_at?: string
  completed_at?: string
  due_at?: string
  assigned_to?: string
  asset_id?: string
  site_id?: string
  asset?: { name: string }
  site?: { name: string }
  assignee?: { full_name: string }
  vendor?: { company_name: string } | null
}

const PRIORITY_BADGE: Record<string, string> = {
  low:      'bg-primary/10 text-primary',
  medium:   'bg-[#f57f17]/10 text-[#f57f17]',
  high:     'bg-error/10 text-error',
  critical: 'bg-error text-on-error',
}

const STATUS_BADGE: Record<string, string> = {
  new:         'bg-tertiary/10 text-tertiary',
  assigned:    'bg-primary/10 text-primary',
  in_progress: 'bg-secondary/10 text-secondary',
  on_hold:     'bg-error/10 text-error',
  completed:   'bg-primary/20 text-primary',
  closed:      'bg-surface-container text-on-surface-variant',
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{text}</span>
}

const CATEGORIES = ['HVAC','Electrical','Plumbing','Elevator / Lift','Fire Safety','Furniture','Kitchen Equipment','Pool / Gym','IT Equipment','Signage','Vehicle','Other']

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [technicians, setTechnicians] = useState<Technician[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [technicianFilter, setTechnicianFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [bulkTech, setBulkTech] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const supabase = createClient()
  const { t, lang } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchWorkOrders(); fetchTechnicians() }, [statusFilter, priorityFilter, categoryFilter, technicianFilter])

  async function fetchTechnicians() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data } = await supabase.from('users').select('id, full_name').eq('organisation_id', profile.organisation_id).in('role', ['technician', 'manager'])
    if (data) setTechnicians(data)
  }

  async function fetchWorkOrders() {
    setLoading(true)
    let query = supabase.from('work_orders').select('*, assignee:assigned_to(full_name), vendor:assigned_vendor_id(company_name), asset:asset_id(name), site:site_id(name)').order('created_at', { ascending: false })
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (priorityFilter !== 'all') query = query.eq('priority', priorityFilter)
    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter)
    if (technicianFilter !== 'all') query = query.eq('assigned_to', technicianFilter)
    const { data, error } = await query
    if (!error && data) setWorkOrders(data)
    setLoading(false)
  }

  async function handleBulkAssign() {
    if (!bulkTech || selected.length === 0) return
    setBulkAssigning(true)
    await supabase.from('work_orders').update({ assigned_to: bulkTech, status: 'assigned', updated_at: new Date().toISOString() }).in('id', selected)
    setSelected([]); setBulkTech('')
    await fetchWorkOrders()
    setBulkAssigning(false)
  }

  function toggleSelect(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  function toggleSelectAll() { setSelected(selected.length === filtered.length ? [] : filtered.map(w => w.id)) }

  const isOverdue = useCallback((wo: WorkOrder) =>
    wo.due_at && !['completed','closed'].includes(wo.status) && isAfter(new Date(), new Date(wo.due_at)), [])

  const filtered = workOrders.filter(wo => {
    const woNum = wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : ''
    return (
      (wo.title.toLowerCase().includes(search.toLowerCase()) || wo.asset?.name?.toLowerCase().includes(search.toLowerCase()) || wo.site?.name?.toLowerCase().includes(search.toLowerCase()) || woNum.toLowerCase().includes(search.toLowerCase())) &&
      (!dateFrom || new Date(wo.created_at) >= new Date(dateFrom)) &&
      (!dateTo || new Date(wo.created_at) <= new Date(dateTo + 'T23:59:59'))
    )
  })

  const stats = useMemo(() => {
    const completedOrders = workOrders.filter(wo => wo.status === 'completed')
    const avgH = completedOrders.length > 0
      ? completedOrders.reduce((sum, wo) => wo.created_at && wo.completed_at ? sum + (new Date(wo.completed_at).getTime() - new Date(wo.created_at).getTime()) / 3600000 : sum, 0) / completedOrders.length
      : 0
    return {
      all: workOrders.length,
      open: workOrders.filter(w => !['completed', 'closed'].includes(w.status)).length,
      overdue: workOrders.filter(w => isOverdue(w)).length,
      in_progress: workOrders.filter(w => w.status === 'in_progress').length,
      urgent: workOrders.filter(w => w.priority === 'critical' || w.priority === 'high').length,
      avgCompletion: avgH.toFixed(1),
    }
  }, [workOrders, isOverdue])

  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const paginatedItems = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const inputCls = 'bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all'

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('wo.title')}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {stats.all} total · {stats.in_progress} {t('wo.in_progress')} ·{' '}
              <span className={stats.overdue > 0 ? 'text-error font-semibold' : 'text-on-surface-variant'}>{stats.overdue} overdue</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link href='/dashboard/work-orders/checklists'>
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined text-lg">checklist</span>
                {lang === 'ar' ? 'قوائم المهام' : 'Checklists'}
              </button>
            </Link>
            <Link href='/dashboard/work-orders/new'>
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">add</span>
                {t('btn.new_wo')}
              </button>
            </Link>
          </div>
        </div>

        {/* Stats Bento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 bg-primary/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="p-2 bg-primary/10 text-primary rounded-lg w-fit mb-3">
              <span className="material-symbols-outlined">assignment</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Open Orders</p>
            <p className="text-4xl font-bold text-on-surface">{stats.open}</p>
            <p className="text-xs text-on-surface-variant mt-2">Not completed or closed</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 bg-error/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="p-2 bg-error/10 text-error rounded-lg w-fit mb-3">
              <span className="material-symbols-outlined">priority_high</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Urgent (High)</p>
            <p className="text-4xl font-bold text-error">{stats.urgent}</p>
            <p className="text-xs text-on-surface-variant mt-2">Requires attention</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 bg-secondary/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="p-2 bg-secondary/10 text-secondary rounded-lg w-fit mb-3">
              <span className="material-symbols-outlined">pending_actions</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">In Progress</p>
            <p className="text-4xl font-bold text-secondary">{stats.in_progress}</p>
            <p className="text-xs text-on-surface-variant mt-2">Currently being worked</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 bg-primary/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="p-2 bg-primary/10 text-primary rounded-lg w-fit mb-3">
              <span className="material-symbols-outlined">schedule</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Avg. Completion</p>
            <p className="text-4xl font-bold text-on-surface">{stats.avgCompletion}h</p>
            <p className="text-xs text-on-surface-variant mt-2">Created → completed</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-4 space-y-3">
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('wo.search')} aria-label="Search work orders"
            className={`${inputCls} w-full`}
          />

          {/* Status filter */}
          <div className="flex flex-wrap gap-2">
            {['all','new','assigned','in_progress','on_hold','completed','closed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  statusFilter === s ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:border-primary/50 hover:text-primary'
                }`}>
                {s === 'all' ? t('common.all') : s.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Priority + secondary filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {['all','critical','high','medium','low'].map(p => (
              <button key={p} onClick={() => setPriorityFilter(p)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  priorityFilter === p ? 'bg-on-surface text-surface-container-lowest border-on-surface' : 'bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:border-primary/50 hover:text-primary'
                }`}>
                {p === 'all' ? t('filter.all_priorities') : p}
              </button>
            ))}

            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value='all'>{t('filter.all_cats')}</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={technicianFilter} onChange={e => setTechnicianFilter(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value='all'>{t('filter.all_techs')}</option>
              {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
            </select>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-on-surface-variant">From</span>
              <input type='date' value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={`${inputCls} cursor-pointer`} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-on-surface-variant">To</span>
              <input type='date' value={dateTo} onChange={e => setDateTo(e.target.value)} className={`${inputCls} cursor-pointer`} />
            </div>

            {(categoryFilter !== 'all' || technicianFilter !== 'all' || dateFrom || dateTo) && (
              <button onClick={() => { setCategoryFilter('all'); setTechnicianFilter('all'); setDateFrom(''); setDateTo('') }}
                className="px-3 py-1.5 rounded-xl border border-error/30 text-error text-xs font-semibold hover:bg-error/5 transition-colors">
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Bulk assign bar */}
        {selected.length > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-primary">{selected.length} work order{selected.length > 1 ? 's' : ''} selected</span>
            <select value={bulkTech} onChange={e => setBulkTech(e.target.value)} className={inputCls}>
              <option value=''>Select technician to assign...</option>
              {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
            </select>
            <button onClick={handleBulkAssign} disabled={!bulkTech || bulkAssigning}
              className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors">
              {bulkAssigning ? 'Assigning...' : 'Assign All'}
            </button>
            <button onClick={() => setSelected([])} className="px-4 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">
              Cancel
            </button>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="text-on-surface-variant py-8 text-center">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">assignment</span>
            <p className="text-lg font-semibold mb-1">No work orders found</p>
            <p className="text-sm">Try adjusting your filters or create a new work order</p>
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
                    {['WO #','Title','Asset','Site','Category','Priority','Status','Assigned','Due','Created'].map(h => (
                      <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {paginatedItems.map(wo => {
                    const overdue = isOverdue(wo)
                    const isSelected = selected.includes(wo.id)
                    return (
                      <tr key={wo.id} className={`transition-colors hover:bg-surface-container-low ${isSelected ? 'bg-primary/5' : overdue ? 'bg-error/5' : ''}`}>
                        <td className="p-3">
                          <input type='checkbox' checked={isSelected} onChange={() => toggleSelect(wo.id)} className="rounded" />
                        </td>
                        <td className="p-3 text-xs font-mono text-on-surface-variant whitespace-nowrap">
                          {wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : '—'}
                        </td>
                        <td className="p-3 max-w-[200px]">
                          <Link href={'/dashboard/work-orders/' + wo.id} className="text-sm font-semibold text-primary hover:underline truncate block">
                            {wo.title}
                          </Link>
                          {overdue && <span className="text-[10px] text-error bg-error/10 px-1.5 py-0.5 rounded-full font-semibold">Overdue</span>}
                        </td>
                        <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{wo.asset?.name ?? '—'}</td>
                        <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{wo.site?.name ?? '—'}</td>
                        <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{wo.category ?? '—'}</td>
                        <td className="p-3 whitespace-nowrap">
                          <Badge text={wo.priority} cls={PRIORITY_BADGE[wo.priority] ?? PRIORITY_BADGE.medium} />
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <Badge text={wo.status.replace('_', ' ')} cls={STATUS_BADGE[wo.status] ?? STATUS_BADGE.new} />
                        </td>
                        <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{wo.assignee?.full_name ?? (wo.vendor?.company_name ? `${wo.vendor.company_name} (Vendor)` : t('common.unassigned'))}</td>
                        <td className={`p-3 text-sm whitespace-nowrap ${overdue ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>
                          {wo.due_at ? format(new Date(wo.due_at), 'dd MMM yyyy') : '—'}
                        </td>
                        <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">
                          {format(new Date(wo.created_at), 'dd MMM yyyy')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-outline-variant/20 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-on-surface-variant">
                Showing {Math.max(1, (currentPage - 1) * itemsPerPage + 1)}–{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} results
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-outline-variant/40 text-on-surface-variant disabled:opacity-40 hover:bg-surface-container-low transition-colors" aria-label="Previous page">
                  <span className="material-symbols-outlined text-lg">chevron_left</span>
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1).reduce<(number | string)[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…')
                  acc.push(p); return acc
                }, []).map((p, i) => p === '…' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-on-surface-variant text-sm">…</span>
                ) : (
                  <button key={p} onClick={() => setCurrentPage(p as number)}
                    className={`min-w-[32px] px-2 py-1.5 rounded-lg text-sm font-semibold transition-colors ${currentPage === p ? 'bg-primary text-on-primary' : 'border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low'}`}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="p-2 rounded-lg border border-outline-variant/40 text-on-surface-variant disabled:opacity-40 hover:bg-surface-container-low transition-colors" aria-label="Next page">
                  <span className="material-symbols-outlined text-lg">chevron_right</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
