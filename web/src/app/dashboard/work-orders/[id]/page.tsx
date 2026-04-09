'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { WorkOrder, WorkOrderStatus } from '@/types/work-order'
import PriorityBadge from '@/components/PriorityBadge'
import StatusBadge from '@/components/StatusBadge'
import { format, formatDistanceToNow, isAfter, differenceInHours, differenceInDays } from 'date-fns'
import { useParams } from 'next/navigation'

export default function WorkOrderDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'comments' | 'history' | 'photos'>('comments')
  const [closeoutPhotos, setCloseoutPhotos] = useState<File[]>([])
  const [closeoutPreviewUrls, setCloseoutPreviewUrls] = useState<string[]>([])
  const [signoffName, setSignoffName] = useState('')
  const [showSignoff, setShowSignoff] = useState(false)
  const fileInputRef = useState<React.RefObject<HTMLInputElement>>(() => ({ current: null }))[0]

  useEffect(() => {
    fetchWorkOrder()
    fetchComments()
    fetchHistory()
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

  async function fetchHistory() {
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('entity_id', id)
      .eq('entity_type', 'work_order')
      .order('created_at', { ascending: false })
    if (data) setHistory(data)
  }

  async function updateStatus(newStatus: WorkOrderStatus) {
    if (newStatus === 'closed') {
      setShowSignoff(true)
      return
    }
    if (newStatus === 'completed' && closeoutPhotos.length === 0) {
      alert('Please attach at least one close-out photo before marking as completed.')
      setActiveTab('photos')
      return
    }
    await doStatusUpdate(newStatus)
  }

  async function doStatusUpdate(newStatus: WorkOrderStatus, signoff?: string) {
    setUpdating(true)
    const { data: { user } } = await supabase.auth.getUser()

    let closeoutPhotoUrls: string[] = []
    if (closeoutPhotos.length > 0 && wo) {
      for (const file of closeoutPhotos) {
        const fileName = `${wo.organisation_id}/${Date.now()}-closeout-${file.name}`
        const { data: uploadData } = await supabase.storage.from('work-order-media').upload(fileName, file)
        if (uploadData) {
          const { data: urlData } = supabase.storage.from('work-order-media').getPublicUrl(uploadData.path)
          closeoutPhotoUrls.push(urlData.publicUrl)
        }
      }
    }

    const existingPhotos = wo?.photo_urls ?? []
    const allPhotos = [...existingPhotos, ...closeoutPhotoUrls]

    await supabase.from('work_orders').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...(newStatus === 'in_progress' ? { started_at: new Date().toISOString() } : {}),
      ...(newStatus === 'completed' ? { completed_at: new Date().toISOString() } : {}),
      ...(newStatus === 'closed' ? { closed_at: new Date().toISOString() } : {}),
      ...(closeoutPhotoUrls.length > 0 ? { photo_urls: allPhotos } : {}),
      ...(signoff ? { completion_notes: `Signed off by: ${signoff}` } : {}),
    }).eq('id', id)

    await supabase.from('audit_logs').insert({
      entity_type: 'work_order',
      entity_id: id,
      action: `Status changed to ${newStatus}${signoff ? ` — signed off by ${signoff}` : ''}`,
      user_id: user?.id,
      organisation_id: wo?.organisation_id,
      new_values: { status: newStatus },
      old_values: { status: wo?.status },
    })

    setShowSignoff(false)
    setSignoffName('')
    await fetchWorkOrder()
    await fetchHistory()
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

  function handleCloseoutPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    setCloseoutPhotos(prev => [...prev, ...files].slice(0, 8))
    const urls = files.map(f => URL.createObjectURL(f))
    setCloseoutPreviewUrls(prev => [...prev, ...urls].slice(0, 8))
  }

  function getSLAInfo() {
    if (!wo?.due_at) return null
    const now = new Date()
    const due = new Date(wo.due_at)
    const overdue = isAfter(now, due)
    const hoursLeft = differenceInHours(due, now)
    const hoursPast = differenceInHours(now, due)
    return { overdue, hoursLeft, hoursPast, due }
  }

  function getMediaExpiryInfo() {
    if (!wo?.media_expires_at) return null
    const expires = new Date(wo.media_expires_at)
    const daysLeft = differenceInDays(expires, new Date())
    return { expires, daysLeft, warning: daysLeft <= 30 }
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!wo) return <div style={{ padding: '2rem' }}>Work order not found.</div>

  const sla = getSLAInfo()
  const mediaExpiry = getMediaExpiryInfo()
  const allPhotos = wo.photo_urls ?? []

  const nextStatuses: Record<WorkOrderStatus, WorkOrderStatus[]> = {
    new:         ['assigned', 'in_progress'],
    assigned:    ['in_progress', 'on_hold'],
    in_progress: ['on_hold', 'completed'],
    on_hold:     ['in_progress', 'completed'],
    completed:   ['closed'],
    closed:      [],
  }

  const cardStyle = { background: '#f9f9f9', borderRadius: 8, padding: '12px 16px' }
  const tabStyle = (active: boolean) => ({
    padding: '8px 16px',
    border: 'none',
    borderBottom: active ? '2px solid #1a1a2e' : '2px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: (active ? 600 : 400) as any,
    color: active ? '#1a1a2e' : '#999',
  })

  return (
    <div style={{ padding: '2rem', maxWidth: 860, margin: '0 auto' }}>
      <a href="/dashboard/work-orders" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>← Back to Work Orders</a>

      {/* Title */}
      <div style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{wo.title}</h1>
          <PriorityBadge priority={wo.priority} />
          <StatusBadge status={wo.status} />
          {(wo as any).category && (
            <span style={{ fontSize: 12, background: '#f0f0f0', color: '#555', padding: '2px 10px', borderRadius: 12 }}>
              {(wo as any).category}
            </span>
          )}
        </div>
        <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>
          Created {format(new Date(wo.created_at), 'dd MMM yyyy, HH:mm')} · Updated {formatDistanceToNow(new Date(wo.updated_at), { addSuffix: true })}
        </p>
      </div>

      {/* SLA banner */}
      {sla && !['completed', 'closed'].includes(wo.status) && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: '1rem',
          background: sla.overdue ? '#fce4ec' : sla.hoursLeft < 24 ? '#fff8e1' : '#e8f5e9',
          border: `1px solid ${sla.overdue ? '#ef9a9a' : sla.hoursLeft < 24 ? '#ffe082' : '#a5d6a7'}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>{sla.overdue ? '🔴' : sla.hoursLeft < 24 ? '🟡' : '🟢'}</span>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: sla.overdue ? '#b71c1c' : sla.hoursLeft < 24 ? '#f57f17' : '#2e7d32' }}>
            {sla.overdue ? `Overdue by ${sla.hoursPast} hours` : sla.hoursLeft < 24 ? `Due in ${sla.hoursLeft} hours` : `Due ${format(sla.due, 'dd MMM yyyy, HH:mm')}`}
          </p>
        </div>
      )}

      {/* Media expiry notice */}
      {mediaExpiry && mediaExpiry.warning && allPhotos.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: '1rem',
          background: '#fff3e0', border: '1px solid #ffcc80',
          fontSize: 13, color: '#e65100',
        }}>
          ⏳ Photos attached to this work order will be purged in {mediaExpiry.daysLeft} days ({format(mediaExpiry.expires, 'dd MMM yyyy')}). Download them before this date if needed.
        </div>
      )}

      {/* Info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.5rem' }}>
        {[
          { label: 'Asset', value: (wo.asset as any)?.name ?? '—' },
          { label: 'Site', value: (wo.site as any)?.name ?? '—' },
          { label: 'Assigned To', value: (wo.assignee as any)?.full_name ?? 'Unassigned' },
          { label: 'Category', value: (wo as any).category ?? '—' },
          { label: 'Started', value: wo.started_at ? format(new Date(wo.started_at), 'dd MMM yyyy, HH:mm') : '—' },
          { label: 'Completed', value: wo.completed_at ? format(new Date(wo.completed_at), 'dd MMM yyyy, HH:mm') : '—' },
          { label: 'SLA', value: wo.sla_hours ? `${wo.sla_hours} hours` : '—' },
          { label: 'Source', value: wo.source?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} style={cardStyle}>
            <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Description */}
      {wo.description && (
        <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 12, color: '#999', margin: '0 0 6px' }}>Description</p>
          <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}>{wo.description}</p>
        </div>
      )}

      {/* Completion notes / sign-off */}
      {wo.completion_notes && (
        <div style={{ ...cardStyle, marginBottom: '1.5rem', border: '1px solid #a5d6a7' }}>
          <p style={{ fontSize: 12, color: '#2e7d32', margin: '0 0 6px' }}>Digital Sign-off</p>
          <p style={{ fontSize: 14, margin: 0 }}>{wo.completion_notes}</p>
        </div>
      )}

      {/* Status actions */}
      {nextStatuses[wo.status].length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Update Status</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {nextStatuses[wo.status].map(s => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={updating}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                {updating ? '...' : `→ ${s.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Digital sign-off modal */}
      {showSignoff && (
        <div style={{ background: '#f9f9f9', border: '1px solid #ddd', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Digital Sign-off Required</p>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>Enter your full name to confirm you have reviewed and approved this work order for closing.</p>
          <input
            value={signoffName}
            onChange={e => setSignoffName(e.target.value)}
            placeholder="Your full name"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { if (signoffName.trim()) doStatusUpdate('closed', signoffName.trim()) }}
              disabled={!signoffName.trim() || updating}
              style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
            >
              {updating ? 'Closing...' : 'Confirm & Close Work Order'}
            </button>
            <button
              onClick={() => setShowSignoff(false)}
              style={{ padding: '8px 16px', background: 'white', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #eee', marginBottom: '1rem', display: 'flex', gap: 0 }}>
        <button style={tabStyle(activeTab === 'comments')} onClick={() => setActiveTab('comments')}>Comments ({comments.length})</button>
        <button style={tabStyle(activeTab === 'photos')} onClick={() => setActiveTab('photos')}>Photos ({allPhotos.length + closeoutPreviewUrls.length})</button>
        <button style={tabStyle(activeTab === 'history')} onClick={() => setActiveTab('history')}>History ({history.length})</button>
      </div>

      {/* Comments tab */}
      {activeTab === 'comments' && (
        <div>
          {comments.length === 0 && <p style={{ fontSize: 13, color: '#999', marginBottom: 12 }}>No comments yet.</p>}
          {comments.map(c => (
            <div key={c.id} style={{ ...cardStyle, marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>{c.user?.full_name ?? 'Unknown'} · {format(new Date(c.created_at), 'dd MMM yyyy, HH:mm')}</p>
              <p style={{ fontSize: 14, margin: 0 }}>{c.body}</p>
            </div>
          ))}
          <form onSubmit={addComment} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment..." style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }} />
            <button type="submit" style={{ padding: '8px 16px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Post</button>
          </form>
        </div>
      )}

      {/* Photos tab */}
      {activeTab === 'photos' && (
        <div>
          {mediaExpiry && allPhotos.length > 0 && (
            <p style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
              Photos retained until {format(mediaExpiry.expires, 'dd MMM yyyy')} · {mediaExpiry.daysLeft} days remaining
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {allPhotos.map((url, i) => (
              <img key={i} src={url} alt={`Photo ${i + 1}`} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
            ))}
            {allPhotos.length === 0 && closeoutPreviewUrls.length === 0 && (
              <p style={{ fontSize: 13, color: '#999' }}>No photos attached yet.</p>
            )}
          </div>

          {!['completed', 'closed'].includes(wo.status) && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                Add close-out photos {wo.status === 'in_progress' ? '(required before marking Completed)' : ''}
              </p>
              <input type="file" accept="image/*" multiple onChange={handleCloseoutPhoto} style={{ fontSize: 13 }} />
              {closeoutPreviewUrls.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {closeoutPreviewUrls.map((url, i) => (
                    <img key={i} src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {activeTab === 'history' && (
        <div>
          {history.length === 0 && <p style={{ fontSize: 13, color: '#999' }}>No history yet. Status changes will appear here.</p>}
          {history.map(h => (
            <div key={h.id} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1a1a2e', marginTop: 5, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 13, margin: 0, fontWeight: 500 }}>{h.action}</p>
                <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>{formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}