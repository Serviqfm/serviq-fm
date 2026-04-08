'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { WorkOrder, WorkOrderStatus } from '@/types/work-order'
import PriorityBadge from '@/components/PriorityBadge'
import StatusBadge from '@/components/StatusBadge'
import { format } from 'date-fns'
import { useParams } from 'next/navigation'

export default function WorkOrderDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<any[]>([])

  useEffect(() => {
    fetchWorkOrder()
    fetchComments()
  }, [id])

  async function fetchWorkOrder() {
    const { data } = await supabase
      .from('work_orders')
      .select('*, assignee:assigned_to(full_name), asset:asset_id(name), site:site_id(name)')
      .eq('id', id)
      .single()
    if (data) setWo(data as WorkOrder)
    setLoading(false)
  }

  async function fetchComments() {
    const { data } = await supabase
      .from('work_order_comments')
      .select('*, user:user_id(full_name)')
      .eq('work_order_id', id)
      .order('created_at', { ascending: true })
    if (data) setComments(data)
  }

  async function updateStatus(newStatus: WorkOrderStatus) {
    setUpdating(true)
    await supabase.from('work_orders').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
    await fetchWorkOrder()
    setUpdating(false)
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('work_order_comments').insert({ work_order_id: id, user_id: user.id, body: comment })
    setComment('')
    fetchComments()
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!wo) return <div style={{ padding: '2rem' }}>Work order not found.</div>

  const nextStatuses: Record<WorkOrderStatus, WorkOrderStatus[]> = {
    new:         ['assigned', 'in_progress'],
    assigned:    ['in_progress', 'on_hold'],
    in_progress: ['on_hold', 'completed'],
    on_hold:     ['in_progress', 'completed'],
    completed:   ['closed'],
    closed:      [],
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <a href="/dashboard/work-orders" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>← Back to Work Orders</a>

      <div style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{wo.title}</h1>
          <PriorityBadge priority={wo.priority} />
          <StatusBadge status={wo.status} />
        </div>
        <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>
          Created {format(new Date(wo.created_at), 'dd MMM yyyy, HH:mm')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'Asset', value: wo.asset?.name ?? '—' },
          { label: 'Site', value: wo.site?.name ?? '—' },
          { label: 'Assigned To', value: wo.assignee?.full_name ?? 'Unassigned' },
          { label: 'Due Date', value: wo.due_at ? format(new Date(wo.due_at), 'dd MMM yyyy') : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px 16px' }}>
            <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {wo.description && (
        <div style={{ background: '#f9f9f9', borderRadius: 8, padding: '16px', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 12, color: '#999', margin: '0 0 6px' }}>Description</p>
          <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}>{wo.description}</p>
        </div>
      )}

      {nextStatuses[wo.status].length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Update Status</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {nextStatuses[wo.status].map(s => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={updating}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                {updating ? '...' : `Mark as ${s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Comments</p>
        {comments.length === 0 && <p style={{ fontSize: 13, color: '#999', marginBottom: 12 }}>No comments yet.</p>}
        {comments.map(c => (
          <div key={c.id} style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>{c.user?.full_name ?? 'Unknown'} · {format(new Date(c.created_at), 'dd MMM, HH:mm')}</p>
            <p style={{ fontSize: 14, margin: 0 }}>{c.body}</p>
          </div>
        ))}
        <form onSubmit={addComment} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add a comment..."
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }}
          />
          <button type="submit" style={{ padding: '8px 16px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            Post
          </button>
        </form>
      </div>
    </div>
  )
}