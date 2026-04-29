'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { WorkOrder, WorkOrderStatus } from '@/types/work-order'
import PriorityBadge from '@/components/PriorityBadge'
import StatusBadge from '@/components/StatusBadge'
import { format, formatDistanceToNow, isAfter, differenceInHours, differenceInDays } from 'date-fns'
import { useParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import TranslateButton from '@/components/TranslateButton'
import { C, F, primaryBtn, secondaryBtn, inputStyle, pageStyle } from '@/lib/brand'
import { sendPushNotification } from '@/lib/push'

export default function WorkOrderDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [comment, setComment] = useState('')
  const [comments, setComments] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const { lang } = useLanguage()
  const [translatedWO, setTranslatedWO] = useState<Record<string,string>>({})
  const [activeTab, setActiveTab] = useState<'comments' | 'history' | 'photos' | 'parts' | 'activity'>('comments')
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [partsUsed, setPartsUsed] = useState<any[]>([])
  const [selectedPartId, setSelectedPartId] = useState('')
  const [partQty, setPartQty] = useState('')
  const [addingPart, setAddingPart] = useState(false)
  const [activityText, setActivityText] = useState('')
  const [activityType, setActivityType] = useState('update')
  const [activities, setActivities] = useState<any[]>([])
  const [addingActivity, setAddingActivity] = useState(false)
  const [closeoutPhotos, setCloseoutPhotos] = useState<File[]>([])
  const [closeoutPreviewUrls, setCloseoutPreviewUrls] = useState<string[]>([])
  const [signoffName, setSignoffName] = useState('')
  const [showSignoff, setShowSignoff] = useState(false)
  const fileInputRef = useState<React.RefObject<HTMLInputElement>>(() => ({ current: null }))[0]

  useEffect(() => {
    fetchWorkOrder()
    fetchComments()
    fetchHistory()
    fetchInventory()
    fetchActivities()
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

    const messages: Record<string, { title: string; body: string }> = {
      assigned:    { title: 'Work Order Assigned',   body: `WO "${wo?.title}" has been assigned to you` },
      in_progress: { title: 'Work Order Started',    body: `WO "${wo?.title}" is now in progress` },
      completed:   { title: 'Work Order Completed',  body: `WO "${wo?.title}" has been completed — awaiting your approval` },
      closed:      { title: 'Work Order Closed',     body: `WO "${wo?.title}" has been approved and closed` },
    }
    const msg = messages[newStatus]
    if (msg && wo) {
      if (['assigned', 'in_progress'].includes(newStatus) && wo.assigned_to) {
        sendPushNotification({ user_id: wo.assigned_to, ...msg, data: { type: 'work_order', id: wo.id } }).catch(console.error)
      }
      if (['completed', 'closed'].includes(newStatus) && (wo as any).created_by) {
        sendPushNotification({ user_id: (wo as any).created_by, ...msg, data: { type: 'work_order', id: wo.id } }).catch(console.error)
      }
    }

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

  async function fetchInventory() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('inventory_items').select('id, name, unit, stock_quantity, unit_cost').eq('organisation_id', profile.organisation_id).eq('is_active', true).order('name')
    if (data) setInventoryItems(data)
  }

  async function fetchActivities() {
    const { data } = await supabase.from('work_order_comments').select('*, user:user_id(full_name)').eq('work_order_id', id).order('created_at', { ascending: false })
    if (data) setActivities(data.filter((c: any) => c.body.startsWith('[ACTIVITY]')))
  }

  async function addPart() {
    if (!selectedPartId || !partQty || parseFloat(partQty) <= 0) return
    setAddingPart(true)
    const part = inventoryItems.find(i => i.id === selectedPartId)
    if (!part) { setAddingPart(false); return }
    const qty = parseFloat(partQty)
    const newStock = Math.max(0, part.stock_quantity - qty)
    await supabase.from('inventory_items').update({ stock_quantity: newStock, updated_at: new Date().toISOString() }).eq('id', selectedPartId)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('work_order_comments').insert({
      work_order_id: id,
      user_id: user?.id,
      body: '[ACTIVITY] Parts used: ' + qty + ' x ' + part.name + ' (SAR ' + (part.unit_cost ? (qty * part.unit_cost).toFixed(2) : '—') + ')',
    })
    setPartsUsed(prev => [...prev, { name: part.name, qty, unit: part.unit, cost: part.unit_cost ? qty * part.unit_cost : null }])
    setSelectedPartId('')
    setPartQty('')
    await fetchInventory()
    await fetchActivities()
    setAddingPart(false)
  }

  async function addActivity() {
    if (!activityText.trim()) return
    setAddingActivity(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('work_order_comments').insert({
      work_order_id: id,
      user_id: user?.id,
      body: '[ACTIVITY] [' + activityType.toUpperCase() + '] ' + activityText.trim(),
    })
    setActivityText('')
    await fetchActivities()
    setAddingActivity(false)
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

  if (loading) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>Loading...</div>
  if (!wo) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>Work order not found.</div>

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

  const infoCard = { background: C.pageBg, borderRadius: 8, padding: '12px 16px' }

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px',
    border: 'none',
    borderBottom: active ? `2px solid ${C.navy}` : '2px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: (active ? 600 : 400) as any,
    color: active ? C.navy : C.textLight,
    fontFamily: F.en,
  })

  const statusActionColor = (s: WorkOrderStatus): React.CSSProperties => {
    if (s === 'completed') return { background: C.teal, color: C.white, border: 'none' }
    if (s === 'closed')    return { background: C.navy, color: C.white, border: 'none' }
    if (s === 'in_progress') return { background: C.blue, color: C.white, border: 'none' }
    return { background: C.white, color: C.textMid, border: `1px solid ${C.border}` }
  }

  return (
    <div style={{ ...pageStyle, maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/dashboard/work-orders" style={{ color: C.textLight, fontSize: 13, textDecoration: 'none', fontFamily: F.en }}>Back to Work Orders</a>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={'/dashboard/work-orders/' + id + '/edit'}>
            <button style={{ ...secondaryBtn, padding: '6px 16px' }}>Edit</button>
          </a>
          <button onClick={() => window.print()} style={{ ...primaryBtn, padding: '6px 16px' }}>Export PDF</button>
        </div>
      </div>

      <div style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{translatedWO.title ?? wo.title}</h1>
            {lang === 'ar' && (
              <TranslateButton
                texts={{ title: wo.title, description: wo.description ?? '' }}
                onTranslated={setTranslatedWO}
              />
            )}
          </div>
          {translatedWO.description && lang === 'ar' && (
            <p style={{ fontSize: 13, color: C.textMid, fontFamily: F.en, margin: '6px 0 0', direction: 'rtl', background: C.pageBg, padding: '8px 12px', borderRadius: 6 }}>
              {translatedWO.description}
            </p>
          )}
          <PriorityBadge priority={wo.priority} />
          <StatusBadge status={wo.status} />
          {(wo as any).category && (
            <span style={{ fontSize: 12, background: C.pageBg, color: C.textMid, padding: '2px 10px', borderRadius: 12, fontFamily: F.en }}>
              {(wo as any).category}
            </span>
          )}
        </div>
        <p style={{ color: C.textLight, fontSize: 13, marginTop: 6, fontFamily: F.en }}>
          Created {format(new Date(wo.created_at), 'dd MMM yyyy, HH:mm')} · Updated {formatDistanceToNow(new Date(wo.updated_at), { addSuffix: true })}
        </p>
      </div>

      {sla && !['completed', 'closed'].includes(wo.status) && (
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: '1rem',
          background: sla.overdue ? '#fce4ec' : sla.hoursLeft < 24 ? '#fff8e1' : '#e8f5e9',
          border: `1px solid ${sla.overdue ? '#ef9a9a' : sla.hoursLeft < 24 ? '#ffe082' : '#a5d6a7'}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span>{sla.overdue ? '🔴' : sla.hoursLeft < 24 ? '🟡' : '🟢'}</span>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, fontFamily: F.en, color: sla.overdue ? C.danger : sla.hoursLeft < 24 ? C.warning : C.success }}>
            {sla.overdue ? `Overdue by ${sla.hoursPast} hours` : sla.hoursLeft < 24 ? `Due in ${sla.hoursLeft} hours` : `Due ${format(sla.due, 'dd MMM yyyy, HH:mm')}`}
          </p>
        </div>
      )}

      {mediaExpiry && mediaExpiry.warning && allPhotos.length > 0 && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: '1rem',
          background: '#fff3e0', border: '1px solid #ffcc80',
          fontSize: 13, color: '#e65100', fontFamily: F.en,
        }}>
          ⏳ Photos attached to this work order will be purged in {mediaExpiry.daysLeft} days ({format(mediaExpiry.expires, 'dd MMM yyyy')}). Download them before this date if needed.
        </div>
      )}

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
          <div key={label} style={infoCard}>
            <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: 14, fontWeight: 500, color: C.textDark, fontFamily: F.en, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {wo.description && (
        <div style={{ ...infoCard, marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 6px' }}>Description</p>
          <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6, color: C.textDark, fontFamily: F.en }}>{wo.description}</p>
        </div>
      )}

      {wo.completion_notes && (
        <div style={{ ...infoCard, marginBottom: '1.5rem', border: `1px solid ${C.lightTeal}` }}>
          <p style={{ fontSize: 12, color: C.success, fontFamily: F.en, margin: '0 0 6px' }}>Digital Sign-off</p>
          <p style={{ fontSize: 14, margin: 0, color: C.textDark, fontFamily: F.en }}>{wo.completion_notes}</p>
        </div>
      )}

      {nextStatuses[wo.status].length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: C.textMid, fontFamily: F.en }}>Update Status</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {nextStatuses[wo.status].map(s => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={updating}
                style={{ padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: F.en, ...statusActionColor(s) }}
              >
                {updating ? '...' : `→ ${s.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {showSignoff && (
        <div style={{ background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: C.navy, fontFamily: F.en, margin: '0 0 12px' }}>Digital Sign-off Required</p>
          <p style={{ fontSize: 13, color: C.textMid, fontFamily: F.en, margin: '0 0 12px' }}>Enter your full name to confirm you have reviewed and approved this work order for closing.</p>
          <input
            value={signoffName}
            onChange={e => setSignoffName(e.target.value)}
            placeholder="Your full name"
            style={{ ...inputStyle, marginBottom: 12 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { if (signoffName.trim()) doStatusUpdate('closed', signoffName.trim()) }}
              disabled={!signoffName.trim() || updating}
              style={{ ...primaryBtn, opacity: !signoffName.trim() || updating ? 0.5 : 1 }}
            >
              {updating ? 'Closing...' : 'Confirm & Close Work Order'}
            </button>
            <button
              onClick={() => setShowSignoff(false)}
              style={secondaryBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ borderBottom: `1px solid ${C.border}`, marginBottom: '1rem', display: 'flex', gap: 0 }}>
        <button style={tabStyle(activeTab === 'comments')} onClick={() => setActiveTab('comments')}>Comments ({comments.length})</button>
        <button style={tabStyle(activeTab === 'photos')} onClick={() => setActiveTab('photos')}>Photos ({allPhotos.length + closeoutPreviewUrls.length})</button>
        <button style={tabStyle(activeTab === 'history')} onClick={() => setActiveTab('history')}>History ({history.length})</button>
        <button style={tabStyle(activeTab === 'parts')} onClick={() => setActiveTab('parts')}>Parts Used</button>
        <button style={tabStyle(activeTab === 'activity')} onClick={() => setActiveTab('activity')}>Activity Log ({activities.length})</button>
      </div>

      {activeTab === 'comments' && (
        <div>
          {comments.length === 0 && <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, marginBottom: 12 }}>No comments yet.</p>}
          {comments.map(c => (
            <div key={c.id} style={{ ...infoCard, marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 4px' }}>{c.user?.full_name ?? 'Unknown'} · {format(new Date(c.created_at), 'dd MMM yyyy, HH:mm')}</p>
              <p style={{ fontSize: 14, margin: 0, color: C.textDark, fontFamily: F.en }}>{c.body}</p>
            </div>
          ))}
          <form onSubmit={addComment} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment..." style={{ ...inputStyle, flex: 1 }} />
            <button type="submit" style={primaryBtn}>Post</button>
          </form>
        </div>
      )}

      {activeTab === 'photos' && (
        <div>
          {mediaExpiry && allPhotos.length > 0 && (
            <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, marginBottom: 12 }}>
              Photos retained until {format(mediaExpiry.expires, 'dd MMM yyyy')} · {mediaExpiry.daysLeft} days remaining
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {allPhotos.map((url, i) => (
              <img key={i} src={url} alt={`Photo ${i + 1}`} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
            ))}
            {allPhotos.length === 0 && closeoutPreviewUrls.length === 0 && (
              <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No photos attached yet.</p>
            )}
          </div>
          {!['completed', 'closed'].includes(wo.status) && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: C.textMid, fontFamily: F.en, marginBottom: 8 }}>
                Add close-out photos {wo.status === 'in_progress' ? '(required before marking Completed)' : ''}
              </p>
              <input type="file" accept="image/*" multiple onChange={handleCloseoutPhoto} style={{ fontSize: 13, fontFamily: F.en }} />
              {closeoutPreviewUrls.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {closeoutPreviewUrls.map((url, i) => (
                    <img key={i} src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          {history.length === 0 && <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No history yet. Status changes will appear here.</p>}
          {history.map(h => (
            <div key={h.id} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.navy, marginTop: 5, flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 13, margin: 0, fontWeight: 500, color: C.textDark, fontFamily: F.en }}>{h.action}</p>
                <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '2px 0 0' }}>{formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'parts' && (
        <div>
          <p style={{ fontSize: 13, color: C.textMid, fontFamily: F.en, marginBottom: '1rem' }}>Log parts and materials consumed on this work order. Stock levels are automatically deducted.</p>
          {partsUsed.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: C.textDark, fontFamily: F.en, marginBottom: 8 }}>Parts logged this session:</p>
              {partsUsed.map((p, i) => (
                <div key={i} style={{ ...infoCard, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: C.textDark, fontFamily: F.en }}>{p.qty} {p.unit} × {p.name}</span>
                  <span style={{ fontSize: 13, color: C.textMid, fontFamily: F.en }}>{p.cost ? 'SAR ' + p.cost.toFixed(2) : '—'}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, color: C.textMid, fontFamily: F.en, marginBottom: 4 }}>Select Part / Material</label>
              <select value={selectedPartId} onChange={e => setSelectedPartId(e.target.value)} style={inputStyle}>
                <option value=''>Select inventory item...</option>
                {inventoryItems.map(item => (
                  <option key={item.id} value={item.id}>{item.name} (Stock: {item.stock_quantity} {item.unit})</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <label style={{ display: 'block', fontSize: 12, color: C.textMid, fontFamily: F.en, marginBottom: 4 }}>Quantity Used</label>
              <input type='number' value={partQty} onChange={e => setPartQty(e.target.value)} min='0.01' step='0.01' placeholder='0' style={inputStyle} />
            </div>
            <button onClick={addPart} disabled={addingPart || !selectedPartId || !partQty} style={{ ...primaryBtn, opacity: !selectedPartId || !partQty ? 0.5 : 1 }}>
              {addingPart ? '...' : 'Log Parts'}
            </button>
          </div>
          {inventoryItems.length === 0 && (
            <p style={{ fontSize: 13, color: C.warning, fontFamily: F.en, marginTop: 12 }}>No inventory items found. <a href='/dashboard/inventory/new' style={{ color: C.blue }}>Add items to inventory first.</a></p>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div>
          <p style={{ fontSize: 13, color: C.textMid, fontFamily: F.en, marginBottom: '1rem' }}>Log structured work updates — what was done, findings, or next steps.</p>
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              {['update','finding','action','waiting','completed'].map(t => (
                <button key={t} type='button' onClick={() => setActivityType(t)} style={{ padding: '5px 14px', borderRadius: 20, border: `2px solid ${activityType === t ? C.navy : C.border}`, background: activityType === t ? C.navy : C.white, color: activityType === t ? C.white : C.textMid, cursor: 'pointer', fontSize: 12, fontWeight: 500, fontFamily: F.en }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={activityText} onChange={e => setActivityText(e.target.value)} placeholder='Describe what was done or found...' style={{ ...inputStyle, flex: 1 }} />
              <button onClick={addActivity} disabled={addingActivity || !activityText.trim()} style={{ ...primaryBtn, opacity: !activityText.trim() ? 0.5 : 1 }}>
                {addingActivity ? '...' : 'Log Activity'}
              </button>
            </div>
          </div>
          {activities.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No activity logged yet. Use the form above to record work updates.</p>
          ) : (
            activities.map((a: any) => {
              const body = a.body.replace('[ACTIVITY] ', '')
              const typeMatch = body.match(/^\[(\w+)\]/)
              const type = typeMatch ? typeMatch[1].toLowerCase() : 'update'
              const text = body.replace(/^\[\w+\] /, '')
              const typeColors: Record<string, { bg: string; color: string }> = {
                update:    { bg: '#e8eaf6', color: C.navy },
                finding:   { bg: '#fff8e1', color: C.warning },
                action:    { bg: '#e8f5e9', color: C.success },
                waiting:   { bg: '#fce4ec', color: C.danger },
                completed: { bg: '#e8f5e9', color: C.success },
                parts:     { bg: '#f3e5f5', color: '#6a1b9a' },
              }
              const cfg = typeColors[type] ?? typeColors.update
              return (
                <div key={a.id} style={{ ...infoCard, marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', marginTop: 2, fontFamily: F.en }}>
                    {type.toUpperCase()}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, margin: 0, color: C.textDark, fontFamily: F.en }}>{text}</p>
                    <p style={{ fontSize: 11, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>
                      {a.user?.full_name ?? 'Unknown'} · {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
