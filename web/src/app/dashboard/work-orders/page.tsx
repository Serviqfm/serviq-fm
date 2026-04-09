'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isAfter } from 'date-fns'
import Link from 'next/link'

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [search, setSearch] = useState('')
  const supabase = createClient()

  useEffect(() => { fetchWorkOrders() }, [statusFilter, priorityFilter])

  async function fetchWorkOrders() {
    setLoading(true)
    let query = supabase
      .from('work_orders')
      .select('*, assignee:assigned_to(full_name), asset:asset_id(name), site:site_id(name)')
      .order('created_at', { ascending: false })
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (priorityFilter !== 'all') query = query.eq('priority', priorityFilter)
    const { data, error } = await query
    if (!error && data) setWorkOrders(data)
    setLoading(false)
  }

  const filtered = workOrders.filter(wo =>
    wo.title.toLowerCase().includes(search.toLowerCase()) ||
    wo.asset?.name?.toLowerCase().includes(search.toLowerCase()) ||
    wo.site?.name?.toLowerCase().includes(search.toLowerCase())
  )

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

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Work Orders</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>
            {counts.all} total · {counts.in_progress} in progress · <span style={{ color: counts.overdue > 0 ? '#c62828' : '#999' }}>{counts.overdue} overdue</span>
          </p>
        </div>
        <Link href="/dashboard/work-orders/new">
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            + New Work Order
          </button>
        </Link>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by title, asset, or site..."
        style={{ width: '100%', padding: '9px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: '1rem', boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {['all','new','assigned','in_progress','on_hold','completed','closed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={btnStyle(statusFilter === s)}>
            {s === 'all' ? 'All' : s.replace('_',' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {['all','critical','high','medium','low'].map(p => (
          <button key={p} onClick={() => setPriorityFilter(p)} style={{ ...btnStyle(priorityFilter === p), fontSize: 12, padding: '4px 12px' }}>
            {p === 'all' ? 'All Priorities' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

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
                {['Title','Asset','Site','Priority','Status','Assigned To','Due Date','Created'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((wo, i) => {
                const overdue = isOverdue(wo)
                const pCfg = priorityConfig[wo.priority] ?? priorityConfig.medium
                const sCfg = statusConfig[wo.status] ?? statusConfig.new
                return (
                  <tr key={wo.id} style={{ borderBottom: '1px solid #f0f0f0', background: overdue ? '#fff8f8' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <Link href={`/dashboard/work-orders/${wo.id}`} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>
                        {wo.title}
                      </Link>
                      {overdue && <span style={{ marginLeft: 8, fontSize: 11, color: '#c62828', background: '#fce4ec', padding: '1px 6px', borderRadius: 10 }}>Overdue</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{wo.asset?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{wo.site?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>{badge(wo.priority.charAt(0).toUpperCase()+wo.priority.slice(1), pCfg)}</td>
                    <td style={{ padding: '12px 16px' }}>{badge(wo.status.replace('_',' ').replace(/\b\w/g,l=>l.toUpperCase()), sCfg)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{wo.assignee?.full_name ?? 'Unassigned'}</td>
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
