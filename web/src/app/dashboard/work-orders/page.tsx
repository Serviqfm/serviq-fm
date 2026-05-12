'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isAfter } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, pageStyle, cardStyle, primaryBtn, inputStyle, tableHeaderCell, tableCell, LUMINA_COLORS, LUMINA_RADII } from '@/lib/brand'
import Button from '@/components/design-system/Button'

export default function WorkOrdersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [workOrders, setWorkOrders] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isOverdue = (wo: any) =>
    wo.due_at && !['completed','closed'].includes(wo.status) && isAfter(new Date(), new Date(wo.due_at))

  const priorityConfig: Record<string, { bg: string; color: string }> = {
    low:      { bg: LUMINA_COLORS.primaryContainer + '33', color: LUMINA_COLORS.primary },
    medium:   { bg: LUMINA_COLORS.tertiaryContainer + '33', color: LUMINA_COLORS.tertiary },
    high:     { bg: LUMINA_COLORS.tertiaryContainer + '33', color: LUMINA_COLORS.tertiary },
    critical: { bg: LUMINA_COLORS.errorContainer, color: LUMINA_COLORS.error },
  }

  const statusConfig: Record<string, { bg: string; color: string }> = {
    new:         { bg: LUMINA_COLORS.secondaryContainer + '33', color: LUMINA_COLORS.secondary },
    assigned:    { bg: LUMINA_COLORS.primaryContainer + '33', color: LUMINA_COLORS.primary },
    in_progress: { bg: LUMINA_COLORS.tertiaryContainer + '33', color: LUMINA_COLORS.tertiary },
    on_hold:     { bg: LUMINA_COLORS.errorContainer, color: LUMINA_COLORS.error },
    completed:   { bg: LUMINA_COLORS.primaryContainer + '33', color: LUMINA_COLORS.primary },
    closed:      { bg: LUMINA_COLORS.surfaceContainer, color: LUMINA_COLORS.onSurfaceVariant },
  }

  const badge = (text: string, cfg: { bg: string; color: string }) => (
    <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>{text}</span>
  )

  const btnStyle = (active: boolean) => ({
    padding: '6px 14px', borderRadius: 20,
    border: `1px solid ${active ? LUMINA_COLORS.primary : LUMINA_COLORS.outlineVariant}`,
    background: active ? LUMINA_COLORS.primary : LUMINA_COLORS.surfaceContainerLowest,
    color: active ? LUMINA_COLORS.onPrimary : LUMINA_COLORS.onSurfaceVariant,
    cursor: 'pointer', fontSize: 13, fontWeight: 500 as const,
    fontFamily: F.en,
  })

  const counts = {
    all: workOrders.length,
    overdue: workOrders.filter(w => isOverdue(w)).length,
    in_progress: workOrders.filter(w => w.status === 'in_progress').length,
  }

  const categories = ['HVAC','Electrical','Plumbing','Elevator / Lift','Fire Safety','Furniture','Kitchen Equipment','Pool / Gym','IT Equipment','Signage','Vehicle','Other']

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: LUMINA_COLORS.primary, fontFamily: F.en, margin: 0 }}>{t('wo.title')}</h1>
          <p style={{ fontSize: 13, color: LUMINA_COLORS.onSurfaceVariant, fontFamily: F.en, margin: '4px 0 0' }}>
            {counts.all} total · {counts.in_progress} {t('wo.in_progress')} · <span style={{ color: counts.overdue > 0 ? LUMINA_COLORS.error : LUMINA_COLORS.onSurfaceVariant }}>{counts.overdue} overdue</span>
          </p>
        </div>
        <Link href='/dashboard/work-orders/new'>
          <Button variant="primary">{t('btn.new_wo')}</Button>
        </Link>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('wo.search')}
        style={{ ...inputStyle, marginBottom: '1rem' }}
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
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', borderColor: LUMINA_COLORS.outline, color: LUMINA_COLORS.onSurface }}>
          <option value='all'>{t('filter.all_cats')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={technicianFilter} onChange={e => setTechnicianFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', borderColor: LUMINA_COLORS.outline, color: LUMINA_COLORS.onSurface }}>
          <option value='all'>{t('filter.all_techs')}</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: LUMINA_COLORS.onSurfaceVariant, fontFamily: F.en }}>From</span>
          <input type='date' value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', borderColor: LUMINA_COLORS.outline }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: LUMINA_COLORS.onSurfaceVariant, fontFamily: F.en }}>To</span>
          <input type='date' value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', borderColor: LUMINA_COLORS.outline }} />
        </div>
        {(categoryFilter !== 'all' || technicianFilter !== 'all' || dateFrom || dateTo) && (
          <button onClick={() => { setCategoryFilter('all'); setTechnicianFilter('all'); setDateFrom(''); setDateTo('') }} style={{ padding: '6px 14px', borderRadius: LUMINA_RADII.md, border: `1px solid ${LUMINA_COLORS.outlineVariant}`, background: LUMINA_COLORS.surfaceContainerLowest, cursor: 'pointer', fontSize: 13, color: LUMINA_COLORS.error, fontFamily: F.en }}>
            Clear Filters
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <div style={{ background: LUMINA_COLORS.surfaceContainer, border: `1px solid ${LUMINA_COLORS.outlineVariant}`, borderRadius: 10, padding: '12px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: LUMINA_COLORS.primary, fontFamily: F.en }}>{selected.length} work order{selected.length > 1 ? 's' : ''} selected</span>
          <select value={bulkTech} onChange={e => setBulkTech(e.target.value)} style={{ ...inputStyle, width: 'auto', borderColor: LUMINA_COLORS.outline }}>
            <option value=''>Select technician to assign...</option>
            {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
          <Button
            variant="primary"
            size="sm"
            onClick={handleBulkAssign}
            disabled={!bulkTech || bulkAssigning}
            isLoading={bulkAssigning}
          >
            {bulkAssigning ? 'Assigning...' : 'Assign All'}
          </Button>
          <button onClick={() => setSelected([])} style={{ padding: '7px 14px', borderRadius: LUMINA_RADII.md, border: `1px solid ${LUMINA_COLORS.outlineVariant}`, background: LUMINA_COLORS.surfaceContainerLowest, cursor: 'pointer', fontSize: 13, color: LUMINA_COLORS.onSurfaceVariant, fontFamily: F.en }}>
            Cancel
          </button>
        </div>
      )}

      {loading ? (
        <p style={{ color: LUMINA_COLORS.onSurfaceVariant, fontFamily: F.en }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: LUMINA_COLORS.onSurfaceVariant, fontFamily: F.en }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No work orders found</p>
          <p style={{ fontSize: 14 }}>Try adjusting your filters or create a new work order</p>
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden', padding: 0, background: LUMINA_COLORS.surfaceContainerLowest, border: `1px solid ${LUMINA_COLORS.outlineVariant}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: LUMINA_COLORS.surfaceContainer, borderBottom: `1px solid ${LUMINA_COLORS.outlineVariant}` }}>
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
              {filtered.map((wo) => {
                const overdue = isOverdue(wo)
                const pCfg = priorityConfig[wo.priority] ?? priorityConfig.medium
                const sCfg = statusConfig[wo.status] ?? statusConfig.new
                const isSelected = selected.includes(wo.id)
                return (
                  <tr key={wo.id} style={{ background: isSelected ? LUMINA_COLORS.primaryContainer + '22' : overdue ? LUMINA_COLORS.errorContainer + '22' : LUMINA_COLORS.surfaceContainerLowest, borderBottom: `1px solid ${LUMINA_COLORS.outlineVariant}` }}>
                    <td style={{ padding: '12px 16px' }}>
                      <input type='checkbox' checked={isSelected} onChange={() => toggleSelect(wo.id)} />
                    </td>
                    <td style={{ ...tableCell, color: LUMINA_COLORS.onSurfaceVariant, fontWeight: 500, whiteSpace: 'nowrap' as const, borderBottom: 'none' }}>
                      {wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : '—'}
                    </td>
                    <td style={{ ...tableCell, borderBottom: 'none' }}>
                      <Link href={'/dashboard/work-orders/' + wo.id} style={{ color: LUMINA_COLORS.primary, fontWeight: 500, textDecoration: 'none', fontSize: 14, fontFamily: F.en }}>
                        {wo.title}
                      </Link>
                      {overdue && <span style={{ marginLeft: 8, fontSize: 11, color: LUMINA_COLORS.error, background: LUMINA_COLORS.errorContainer, padding: '1px 6px', borderRadius: 10, fontFamily: F.en }}>Overdue</span>}
                    </td>
                    <td style={{ ...tableCell, borderBottom: 'none' }}>{wo.asset?.name ?? '—'}</td>
                    <td style={{ ...tableCell, borderBottom: 'none' }}>{wo.site?.name ?? '—'}</td>
                    <td style={{ ...tableCell, borderBottom: 'none' }}>{wo.category ?? '—'}</td>
                    <td style={{ ...tableCell, borderBottom: 'none' }}>
                      {badge(wo.priority === 'critical' ? t('wo.priority.critical') : wo.priority === 'high' ? t('wo.priority.high') : wo.priority === 'medium' ? t('wo.priority.medium') : t('wo.priority.low'), pCfg)}
                    </td>
                    <td style={{ ...tableCell, borderBottom: 'none' }}>
                      {badge(wo.status === 'new' ? t('wo.status.new') : wo.status === 'assigned' ? t('wo.status.assigned') : wo.status === 'in_progress' ? t('wo.status.in_progress') : wo.status === 'on_hold' ? t('wo.status.on_hold') : wo.status === 'completed' ? t('wo.status.completed') : t('wo.status.closed'), sCfg)}
                    </td>
                    <td style={{ ...tableCell, borderBottom: 'none' }}>{wo.assignee?.full_name ?? t('common.unassigned')}</td>
                    <td style={{ ...tableCell, color: overdue ? LUMINA_COLORS.error : LUMINA_COLORS.onSurfaceVariant, borderBottom: 'none' }}>
                      {wo.due_at ? format(new Date(wo.due_at), 'dd MMM yyyy') : '—'}
                    </td>
                    <td style={{ ...tableCell, borderBottom: 'none' }}>
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
