'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isAfter } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
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
  const supabase = createClient()
  const { t } = useLanguage()

  useEffect(() => { fetchWorkOrders(); fetchTechnicians() }, [statusFilter, priorityFilter, categoryFilter, technicianFilter])

  async function fetchTechnicians() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
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
    const matchSearch = wo.title.toLowerCase().includes(search.toLowerCase()) ||
      wo.asset?.name?.toLowerCase().includes(search.toLowerCase()) ||
      wo.site?.name?.toLowerCase().includes(search.toLowerCase())
    const matchDateFrom = !dateFrom || new Date(wo.created_at) >= new Date(dateFrom)
    const matchDateTo = !dateTo || new Date(wo.created_at) <= new Date(dateTo + 'T23:59:59')
    return matchSearch && matchDateFrom && matchDateTo
  })

  const isOverdue = (wo: any) =>
    wo.due_at && !['completed','closed'].includes(wo.status) && isAfter(new Date(), new Date(wo.due_at))

  const priorityConfig: Record<string, { bg: string; color: string }> = {
    low:      { bg: '#e8f5e9', color: '#2e7d32' },
    medium:   { bg: '#fff8e1', color: '#f57f17' },
    high:     { bg: '#fff3e0', color: '#e65100' },
    critical: { bg: '#fce4ec', color: '#b71c1c' },
  }

  const statusConfig: Record<string, { bg: string; color: string }> = {
    new:         { bg: '#e3f2fd', color: '#0d47a1' },
    assigned:    { bg: '#e8eaf6', color: '#283593' },
    in_progress: { bg: '#fff8e1', color: '#f57f17' },
    on_hold:     { bg: '#fce4ec', color: '#880e4f' },
    completed:   { bg: '#e8f5e9', color: '#1b5e20' },
    closed:      { bg: '#f5f5f5', color: '#424242' },
  }

  const badge = (text: string, cfg: { bg: string; color: string }) => (
    <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>{text}</span>
  )

  const btnStyle = (active: boolean) => ({
    padding: '6px 14px', borderRadius: 20,
    border: '1px solid #ddd',
    background: active ? '#1a1a2e' : 'white',
    color: active ? 'white' : '#333',
    cursor: 'pointer', fontSize: 13, fontWeight: 500 as const,
  })

  const counts = {
    all: workOrders.length,
    overdue: workOrders.filter(w => isOverdue(w)).length,
    in_progress: workOrders.filter(w => w.status === 'in_progress').length,
  }

  const categories = ['HVAC','Electrical','Plumbing','Elevator / Lift','Fire Safety','Furniture','Kitchen Equipment','Pool / Gym','IT Equipment','Signage','Vehicle','Other']
  const selectStyle = { padding: '7px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer' }

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('wo.title')}</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>
            {counts.all} total · {counts.in_progress} in progress · <span style={{ color: counts.overdue > 0 ? '#c62828' : '#999' }}>{counts.overdue} overdue</span>
          </p>
        </div>
        <Link href='/dashboard/work-orders/new'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            {t('btn.new_wo')}
          </button>
        </Link>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('wo.search')}
        style={{ width: '100%', padding: '9px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: '1rem', boxSizing: 'border-box' }}
      />

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
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selectStyle}>
          <option value='all'>{t('filter.all_cats')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={technicianFilter} onChange={e => setTechnicianFilter(e.target.value)} style={selectStyle}>
          <option value='all'>{t('filter.all_techs')}</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#666' }}>From</span>
          <input type='date' value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...selectStyle, cursor: 'pointer' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#666' }}>To</span>
          <input type='date' value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...selectStyle, cursor: 'pointer' }} />
        </div>
        {(categoryFilter !== 'all' || technicianFilter !== 'all' || dateFrom || dateTo) && (
          <button onClick={() => { setCategoryFilter('all'); setTechnicianFilter('all'); setDateFrom(''); setDateTo('') }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13, color: '#c62828' }}>
            Clear Filters
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <div style={{ background: '#e8eaf6', border: '1px solid #c5cae9', borderRadius: 10, padding: '12px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#283593' }}>{selected.length} work order{selected.length > 1 ? 's' : ''} selected</span>
          <select value={bulkTech} onChange={e => setBulkTech(e.target.value)} style={{ ...selectStyle, borderColor: '#9fa8da' }}>
            <option value=''>Select technician to assign...</option>
            {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
          <button
            onClick={handleBulkAssign}
            disabled={!bulkTech || bulkAssigning}
            style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: '#283593', color: 'white', cursor: bulkTech ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 500, opacity: bulkTech ? 1 : 0.5 }}
          >
            {bulkAssigning ? 'Assigning...' : 'Assign All'}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #9fa8da', background: 'white', cursor: 'pointer', fontSize: 13, color: '#666' }}>
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#999' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No work orders found</p>
          <p style={{ fontSize: 14 }}>Try adjusting your filters or create a new work order</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '12px 16px', width: 40 }}>
                  <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                {[t('wo.col.title'),t('wo.col.asset'),t('wo.col.site'),t('assets.col.cat'),t('wo.col.priority'),t('wo.col.status'),t('wo.col.assigned'),t('wo.col.due'),t('common.created')].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((wo, i) => {
                const overdue = isOverdue(wo)
                const pCfg = priorityConfig[wo.priority] ?? priorityConfig.medium
                const sCfg = statusConfig[wo.status] ?? statusConfig.new
                const isSelected = selected.includes(wo.id)
                return (
                  <tr key={wo.id} style={{ borderBottom: '1px solid #f0f0f0', background: isSelected ? '#f3f4fd' : overdue ? '#fff8f8' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <input type='checkbox' checked={isSelected} onChange={() => toggleSelect(wo.id)} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Link href={'/dashboard/work-orders/' + wo.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>
                        {wo.title}
                      </Link>
                      {overdue && <span style={{ marginLeft: 8, fontSize: 11, color: '#c62828', background: '#fce4ec', padding: '1px 6px', borderRadius: 10 }}>Overdue</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{wo.asset?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{wo.site?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{wo.category ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>{badge(wo.priority === 'critical' ? t('wo.priority.critical') : wo.priority === 'high' ? t('wo.priority.high') : wo.priority === 'medium' ? t('wo.priority.medium') : t('wo.priority.low'), pCfg)}</td>
                    <td style={{ padding: '12px 16px' }}>{badge(wo.status === 'new' ? t('wo.status.new') : wo.status === 'assigned' ? t('wo.status.assigned') : wo.status === 'in_progress' ? t('wo.status.in_progress') : wo.status === 'on_hold' ? t('wo.status.on_hold') : wo.status === 'completed' ? t('wo.status.completed') : t('wo.status.closed'), sCfg)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{wo.assignee?.full_name ?? t('common.unassigned')}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: overdue ? '#c62828' : '#666' }}>
                      {wo.due_at ? format(new Date(wo.due_at), 'dd MMM yyyy') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>
                      {format(new Date(wo.created_at), 'dd MMM yyyy')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}