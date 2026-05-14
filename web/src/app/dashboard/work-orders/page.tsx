'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isAfter } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, pageStyle, cardStyle, primaryBtn, inputStyle, tableHeaderCell, tableCell } from '@/lib/brand'

interface Technician {
  id: string
  full_name: string
}

interface RelationData {
  name?: string
  full_name?: string
}

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
}

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
  const { t } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchWorkOrders(); fetchTechnicians() }, [statusFilter, priorityFilter, categoryFilter, technicianFilter])

  async function fetchTechnicians() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      if (typeof window !== 'undefined') window.location.href = '/login'
      return
    }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) {
      setLoading(false)
      return
    }
    const { data } = await supabase.from('users').select('id, full_name').eq('organisation_id', profile.organisation_id).in('role', ['technician', 'manager'])
    if (data) setTechnicians(data)
  }

  async function fetchWorkOrders() {
    setLoading(true)
    let query = supabase
      .from('work_orders')
      .select('*, assignee:assigned_to(full_name), asset:asset_id(name), site:site_id(name)')
      .order('created_at', { ascending: false })
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
    setSelected([])
    setBulkTech('')
    await fetchWorkOrders()
    setBulkAssigning(false)
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    if (selected.length === filtered.length) {
      setSelected([])
    } else {
      setSelected(filtered.map(w => w.id))
    }
  }

  const filtered = workOrders.filter(wo => {
    const woNum = wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : ''
    const matchSearch = wo.title.toLowerCase().includes(search.toLowerCase()) ||
      wo.asset?.name?.toLowerCase().includes(search.toLowerCase()) ||
      wo.site?.name?.toLowerCase().includes(search.toLowerCase()) ||
      woNum.toLowerCase().includes(search.toLowerCase())
    const matchDateFrom = !dateFrom || new Date(wo.created_at) >= new Date(dateFrom)
    const matchDateTo = !dateTo || new Date(wo.created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchDateFrom && matchDateTo
  })

  const isOverdue = useCallback((wo: WorkOrder) =>
    wo.due_at && !['completed','closed'].includes(wo.status) && isAfter(new Date(), new Date(wo.due_at)),
  [])

  const priorityConfig: Record<string, { bg: string; color: string }> = {
    low:      { bg: '#e8f5e9', color: C.success },
    medium:   { bg: '#fff8e1', color: C.warning },
    high:     { bg: '#fff3e0', color: '#e65100' },
    critical: { bg: '#fce4ec', color: C.danger },
  }

  const statusConfig: Record<string, { bg: string; color: string }> = {
    new:         { bg: '#e3f2fd', color: C.blue },
    assigned:    { bg: '#e8eaf6', color: C.navy },
    in_progress: { bg: '#fff8e1', color: C.warning },
    on_hold:     { bg: '#fce4ec', color: C.danger },
    completed:   { bg: '#e8f5e9', color: C.success },
    closed:      { bg: '#f5f5f5', color: C.textMid },
  }

  const badge = (text: string, cfg: { bg: string; color: string }) => (
    <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>{text}</span>
  )

  const btnStyle = (active: boolean) => ({
    padding: '6px 14px', borderRadius: 20,
    border: `1px solid ${active ? C.navy : C.border}`,
    background: active ? C.navy : C.white,
    color: active ? C.white : C.textMid,
    cursor: 'pointer', fontSize: 13, fontWeight: 500 as const,
    fontFamily: F.en,
  })

  const stats = useMemo(() => {
    const overdueCnt = workOrders.filter(w => isOverdue(w)).length
    const inProgressCnt = workOrders.filter(w => w.status === 'in_progress').length
    const completedOrders = workOrders.filter(wo => wo.status === 'completed')
    const avgCompletionHours = completedOrders.length > 0
      ? completedOrders.reduce((sum, wo) => {
          if (wo.created_at && wo.completed_at) {
            const ms = new Date(wo.completed_at).getTime() - new Date(wo.created_at).getTime()
            return sum + (ms / (1000 * 60 * 60))
          }
          return sum
        }, 0) / completedOrders.length
      : 0

    return {
      all: workOrders.length,
      overdue: overdueCnt,
      in_progress: inProgressCnt,
      avgCompletionDisplay: avgCompletionHours.toFixed(1),
    }
  }, [workOrders, isOverdue])

  const counts = {
    all: stats.all,
    overdue: stats.overdue,
    in_progress: stats.in_progress,
  }

  const avgCompletionDisplay = stats.avgCompletionDisplay

  const categories = ['HVAC','Electrical','Plumbing','Elevator / Lift','Fire Safety','Furniture','Kitchen Equipment','Pool / Gym','IT Equipment','Signage','Vehicle','Other']

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{t('wo.title')}</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>
            {counts.all} total · {counts.in_progress} {t('wo.in_progress')} · <span style={{ color: counts.overdue > 0 ? C.danger : C.textLight }}>{counts.overdue} overdue</span>
          </p>
        </div>
        <Link href='/dashboard/work-orders/new'>
          <button style={primaryBtn}>{t('btn.new_wo')}</button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: C.white, padding: '1.5rem', borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 12, color: C.textMid, fontWeight: 600, fontFamily: F.en, margin: 0, marginBottom: '0.5rem' }}>Open Orders</p>
          <p style={{ fontSize: 32, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0, marginBottom: '0.75rem' }}>{counts.all}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 12, color: C.success, fontFamily: F.en }}>
            <span style={{ fontSize: 16 }} className="material-symbols-outlined">trending_up</span>
            <span>12% from last week</span>
          </div>
        </div>

        <div style={{ background: C.white, padding: '1.5rem', borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 12, color: C.textMid, fontWeight: 600, fontFamily: F.en, margin: 0, marginBottom: '0.5rem' }}>Urgent (High)</p>
          <p style={{ fontSize: 32, fontWeight: 700, color: C.danger, fontFamily: F.en, margin: 0, marginBottom: '0.75rem' }}>{workOrders.filter(w => w.priority === 'critical' || w.priority === 'high').length}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 12, color: C.textMid, fontFamily: F.en }}>
            <span>Requires attention</span>
          </div>
        </div>

        <div style={{ background: C.white, padding: '1.5rem', borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 12, color: C.textMid, fontWeight: 600, fontFamily: F.en, margin: 0, marginBottom: '0.5rem' }}>In Progress</p>
          <p style={{ fontSize: 32, fontWeight: 700, color: '#0288d1', fontFamily: F.en, margin: 0, marginBottom: '0.75rem' }}>{counts.in_progress}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 12, color: C.textMid, fontFamily: F.en }}>
            <span>Across multiple sites</span>
          </div>
        </div>

        <div style={{ background: C.white, padding: '1.5rem', borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: 12, color: C.textMid, fontWeight: 600, fontFamily: F.en, margin: 0, marginBottom: '0.5rem' }}>Avg. Completion</p>
          <p style={{ fontSize: 32, fontWeight: 700, color: C.textDark, fontFamily: F.en, margin: 0, marginBottom: '0.75rem' }}>{avgCompletionDisplay}h</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 12, color: C.success, fontFamily: F.en }}>
            <span style={{ fontSize: 16 }} className="material-symbols-outlined">check_circle</span>
            <span>Optimal efficiency</span>
          </div>
        </div>
      </div>

      {/* Search bar - hidden on mobile, visible on sm+ */}
      <div className="hidden sm:block" style={{ marginBottom: '1rem' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('wo.search')}
          aria-label="Search work orders"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {['all','new','assigned','in_progress','on_hold','completed','closed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={btnStyle(statusFilter === s)}>
            {s === 'all' ? t('common.all') : s === 'new' ? t('wo.status.new') : s === 'assigned' ? t('wo.status.assigned') : s === 'in_progress' ? t('wo.status.in_progress') : s === 'on_hold' ? t('wo.status.on_hold') : s === 'completed' ? t('wo.status.completed') : s === 'closed' ? t('wo.status.closed') : s}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {['all','critical','high','medium','low'].map(p => (
          <button key={p} onClick={() => setPriorityFilter(p)} style={{ ...btnStyle(priorityFilter === p), fontSize: 12, padding: '4px 12px' }}>
            {p === 'all' ? t('filter.all_priorities') : p === 'critical' ? t('wo.priority.critical') : p === 'high' ? t('wo.priority.high') : p === 'medium' ? t('wo.priority.medium') : t('wo.priority.low')}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value='all'>{t('filter.all_cats')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={technicianFilter} onChange={e => setTechnicianFilter(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value='all'>{t('filter.all_techs')}</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: C.textMid, fontFamily: F.en }}>From</span>
          <input type='date' value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: C.textMid, fontFamily: F.en }}>To</span>
          <input type='date' value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }} />
        </div>
        {(categoryFilter !== 'all' || technicianFilter !== 'all' || dateFrom || dateTo) && (
          <button onClick={() => { setCategoryFilter('all'); setTechnicianFilter('all'); setDateFrom(''); setDateTo('') }} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 13, color: C.danger, fontFamily: F.en }}>
            Clear Filters
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.navy, fontFamily: F.en }}>{selected.length} work order{selected.length > 1 ? 's' : ''} selected</span>
          <select value={bulkTech} onChange={e => setBulkTech(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
            <option value=''>Select technician to assign...</option>
            {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
          <button
            onClick={handleBulkAssign}
            disabled={!bulkTech || bulkAssigning}
            style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: C.navy, color: C.white, cursor: bulkTech ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 500, opacity: bulkTech ? 1 : 0.5, fontFamily: F.en }}
          >
            {bulkAssigning ? 'Assigning...' : 'Assign All'}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 13, color: C.textMid, fontFamily: F.en }}>
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.textLight, fontFamily: F.en }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No work orders found</p>
          <p style={{ fontSize: 14 }}>Try adjusting your filters or create a new work order</p>
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: '10px 16px', width: 40 }}>
                  <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                <th style={tableHeaderCell}>WO #</th>
                {[t('wo.col.title'),t('wo.col.asset'),t('wo.col.site'),t('assets.col.cat'),t('wo.col.priority'),t('wo.col.status'),t('wo.col.assigned'),t('wo.col.due'),t('common.created')].map(h => (
                  <th key={h} style={tableHeaderCell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const totalPages = Math.ceil(filtered.length / itemsPerPage)
                const startIdx = (currentPage - 1) * itemsPerPage
                const paginatedItems = filtered.slice(startIdx, startIdx + itemsPerPage)

                return paginatedItems.map((wo) => {
                  const overdue = isOverdue(wo)
                  const pCfg = priorityConfig[wo.priority] ?? priorityConfig.medium
                  const sCfg = statusConfig[wo.status] ?? statusConfig.new
                  const isSelected = selected.includes(wo.id)
                  return (
                    <tr key={wo.id} style={{ background: isSelected ? '#EEF2FF' : overdue ? '#FFF8F8' : C.white }}>
                      <td style={{ padding: '12px 16px' }}>
                        <input type='checkbox' checked={isSelected} onChange={() => toggleSelect(wo.id)} />
                      </td>
                      <td style={{ ...tableCell, color: C.textMid, fontWeight: 500, whiteSpace: 'nowrap' as const }}>
                        {wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : '—'}
                      </td>
                      <td style={tableCell}>
                        <Link href={'/dashboard/work-orders/' + wo.id} style={{ color: C.navy, fontWeight: 500, textDecoration: 'none', fontSize: 14, fontFamily: F.en }}>
                          {wo.title}
                        </Link>
                        {overdue && <span style={{ marginLeft: 8, fontSize: 11, color: C.danger, background: '#fce4ec', padding: '1px 6px', borderRadius: 10, fontFamily: F.en }}>Overdue</span>}
                      </td>
                      <td style={tableCell}>{wo.asset?.name ?? '—'}</td>
                      <td style={tableCell}>{wo.site?.name ?? '—'}</td>
                      <td style={tableCell}>{wo.category ?? '—'}</td>
                      <td style={tableCell}>
                        {badge(wo.priority === 'critical' ? t('wo.priority.critical') : wo.priority === 'high' ? t('wo.priority.high') : wo.priority === 'medium' ? t('wo.priority.medium') : t('wo.priority.low'), pCfg)}
                      </td>
                      <td style={tableCell}>
                        {badge(wo.status === 'new' ? t('wo.status.new') : wo.status === 'assigned' ? t('wo.status.assigned') : wo.status === 'in_progress' ? t('wo.status.in_progress') : wo.status === 'on_hold' ? t('wo.status.on_hold') : wo.status === 'completed' ? t('wo.status.completed') : t('wo.status.closed'), sCfg)}
                      </td>
                      <td style={tableCell}>{wo.assignee?.full_name ?? t('common.unassigned')}</td>
                      <td style={{ ...tableCell, color: overdue ? C.danger : C.textMid }}>
                        {wo.due_at ? format(new Date(wo.due_at), 'dd MMM yyyy') : '—'}
                      </td>
                      <td style={tableCell}>
                        {format(new Date(wo.created_at), 'dd MMM yyyy')}
                      </td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>

          {/* Pagination Footer */}
          <div style={{ padding: '1.5rem', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <span style={{ fontSize: 13, color: C.textMid, fontFamily: F.en }}>
              Showing {Math.max(1, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} results
            </span>

            {(() => {
              const totalPages = Math.ceil(filtered.length / itemsPerPage)
              const pages: (number | string)[] = []
              const showPages = 5

              if (totalPages <= showPages) {
                for (let i = 1; i <= totalPages; i++) {
                  pages.push(i)
                }
              } else {
                pages.push(1)
                if (currentPage > 3) pages.push('...')

                const start = Math.max(2, currentPage - 1)
                const end = Math.min(totalPages - 1, currentPage + 1)
                for (let i = start; i <= end; i++) {
                  if (!pages.includes(i)) pages.push(i)
                }

                if (currentPage < totalPages - 2) pages.push('...')
                if (!pages.includes(totalPages)) pages.push(totalPages)
              }

              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    style={{ padding: '0.5rem', border: `1px solid ${C.border}`, background: C.white, borderRadius: 8, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}
                    aria-label="Previous page"
                  >
                    <span className="material-symbols-outlined">chevron_left</span>
                  </button>

                  {pages.map((page, idx) => (
                    page === '...' ? (
                      <span key={idx} style={{ padding: '0.5rem', color: C.textMid, fontFamily: F.en }}>...</span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page as number)}
                        style={{
                          padding: '0.5rem 0.75rem',
                          borderRadius: 8,
                          border: currentPage === page ? 'none' : `1px solid ${C.border}`,
                          background: currentPage === page ? C.navy : C.white,
                          color: currentPage === page ? C.white : C.textMid,
                          cursor: 'pointer',
                          fontSize: 13,
                          fontWeight: 500,
                          fontFamily: F.en,
                          minWidth: '32px',
                          textAlign: 'center'
                        }}
                      >
                        {page}
                      </button>
                    )
                  ))}

                  <button
                    onClick={() => setCurrentPage(Math.min(Math.ceil(filtered.length / itemsPerPage), currentPage + 1))}
                    disabled={currentPage === Math.ceil(filtered.length / itemsPerPage)}
                    style={{ padding: '0.5rem', border: `1px solid ${C.border}`, background: C.white, borderRadius: 8, cursor: currentPage === Math.ceil(filtered.length / itemsPerPage) ? 'not-allowed' : 'pointer', opacity: currentPage === Math.ceil(filtered.length / itemsPerPage) ? 0.5 : 1 }}
                    aria-label="Next page"
                  >
                    <span className="material-symbols-outlined">chevron_right</span>
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
