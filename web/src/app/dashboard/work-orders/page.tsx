'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { WorkOrder } from '@/types/work-order'
import PriorityBadge from '@/components/PriorityBadge'
import StatusBadge from '@/components/StatusBadge'
import { format } from 'date-fns'
import Link from 'next/link'

export default function WorkOrdersPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const supabase = createClient()

  useEffect(() => {
    fetchWorkOrders()
  }, [filter])

  async function fetchWorkOrders() {
    setLoading(true)
    let query = supabase
      .from('work_orders')
      .select(`
        *,
        assignee:assigned_to(full_name),
        asset:asset_id(name),
        site:site_id(name)
      `)
      .order('created_at', { ascending: false })

    if (filter !== 'all') {
      query = query.eq('status', filter)
    }

    const { data, error } = await query
    if (!error && data) setWorkOrders(data as WorkOrder[])
    setLoading(false)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Work Orders</h1>
        <Link href="/dashboard/work-orders/new">
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            + New Work Order
          </button>
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {['all', 'new', 'assigned', 'in_progress', 'on_hold', 'completed', 'closed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              border: '1px solid #ddd',
              background: filter === s ? '#1a1a2e' : 'white',
              color: filter === s ? 'white' : '#333',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#999' }}>Loading work orders...</p>
      ) : workOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No work orders yet</p>
          <p style={{ fontSize: 14 }}>Create your first work order to get started</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                {['Title', 'Asset', 'Site', 'Priority', 'Status', 'Assigned To', 'Due Date'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo, i) => (
                <tr
                  key={wo.id}
                  style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={`/dashboard/work-orders/${wo.id}`} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>
                      {wo.title}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{wo.asset?.name ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{wo.site?.name ?? '—'}</td>
                  <td style={{ padding: '12px 16px' }}><PriorityBadge priority={wo.priority} /></td>
                  <td style={{ padding: '12px 16px' }}><StatusBadge status={wo.status} /></td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{wo.assignee?.full_name ?? 'Unassigned'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>
                    {wo.due_at ? format(new Date(wo.due_at), 'dd MMM yyyy') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}