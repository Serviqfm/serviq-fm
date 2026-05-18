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
import { sendPushNotification } from '@/lib/push'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'

export default function WorkOrderDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const { isHidden: isCloseHidden, isRequired: isCloseRequired } = useFieldConfig('work_orders_close')
  const isCloseReq = (key: string) => isCloseRequired(key) || isSystemRequired('work_orders_close', key)
  const [wo, setWo] = useState<WorkOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [comment, setComment] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [comments, setComments] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([])
  const { lang } = useLanguage()
  const [translatedWO, setTranslatedWO] = useState<Record<string,string>>({})
  const [activeTab, setActiveTab] = useState<'comments' | 'history' | 'photos' | 'parts' | 'activity' | 'space_assets'>('comments')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [partsUsed, setPartsUsed] = useState<any[]>([])
  const [selectedPartId, setSelectedPartId] = useState('')
  const [partQty, setPartQty] = useState('')
  const [addingPart, setAddingPart] = useState(false)
  const [activityText, setActivityText] = useState('')
  const [activityType, setActivityType] = useState('update')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activities, setActivities] = useState<any[]>([])
  const [addingActivity, setAddingActivity] = useState(false)
  const [closeoutPhotos, setCloseoutPhotos] = useState<File[]>([])
  const [closeoutPreviewUrls, setCloseoutPreviewUrls] = useState<string[]>([])
  const [signoffName, setSignoffName] = useState('')
  const [showSignoff, setShowSignoff] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [existingInvoice, setExistingInvoice] = useState<any>(null)
  useEffect(() => {
    fetchWorkOrder()
    fetchComments()
    fetchHistory()
    fetchInventory()
    fetchActivities()
    fetchInvoice()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function fetchWorkOrder() {
    const { data } = await supabase
      .from('work_orders')
      .select('*, assignee:assigned_to(full_name, email), asset:asset_id(name), site:site_id(name, invoicing_enabled)')
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
    if (newStatus === 'completed' && isCloseReq('closeout_photos') && closeoutPhotos.length === 0) {
      alert('Please attach at least one close-out photo before marking as completed.')
      setActiveTab('photos')
      return
    }
    await doStatusUpdate(newStatus)
  }

  async function doStatusUpdate(newStatus: WorkOrderStatus, signoff?: string) {
    setUpdating(true)
    const { data: { user } } = await supabase.auth.getUser()

    const closeoutPhotoUrls: string[] = []
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

    // Close-out transitions (completed/closed) go through the server route so
    // enforceFieldConfig(orgId, 'work_orders_close', payload) runs. All other
    // transitions stay client-side for now.
    if (newStatus === 'completed' || newStatus === 'closed') {
      const res = await fetch(`/api/work-orders/${id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          closeout_photo_urls: closeoutPhotoUrls,
          signoff,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        alert(errData?.error ?? 'Failed to update status')
        setUpdating(false)
        return
      }
    } else {
      const existingPhotos = wo?.photo_urls ?? []
      const allPhotos = [...existingPhotos, ...closeoutPhotoUrls]

      await supabase.from('work_orders').update({
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'in_progress' ? { started_at: new Date().toISOString() } : {}),
        ...(closeoutPhotoUrls.length > 0 ? { photo_urls: allPhotos } : {}),
      }).eq('id', id)

      await supabase.from('audit_logs').insert({
        entity_type: 'work_order',
        entity_id: id,
        action: `Status changed to ${newStatus}`,
        user_id: user?.id,
        organisation_id: wo?.organisation_id,
        new_values: { status: newStatus },
        old_values: { status: wo?.status },
      })
    }

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (['completed', 'closed'].includes(newStatus) && (wo as any).created_by) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sendPushNotification({ user_id: (wo as any).created_by, ...msg, data: { type: 'work_order', id: wo.id } }).catch(console.error)
      }
    }

    // Send email notification to assigned technician for all status changes
    if (wo && wo.assigned_to) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assigneeEmail = (wo.assignee as any)?.email
      if (assigneeEmail) {
        const woNumber = wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : String(id)
        fetch('/api/notifications/wo-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: wo.assigned_to,
            userEmail: assigneeEmail,
            woNumber,
            woTitle: wo.title,
            woId: wo.id,
            newStatus,
          }),
        }).catch(console.error)
      }
    }

    // Send requester email if WO originated from a public request
    if (wo?.request_id && ['in_progress','completed','finished'].includes(newStatus)) {
      try {
        const { data: req } = await supabase
          .from('requests')
          .select('requester_name, requester_email, tracking_token, site:site_id(name)')
          .eq('id', wo.request_id)
          .single()
        if (req) {
          await fetch('/api/requests/notify-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requester_name: req.requester_name,
              requester_email: req.requester_email,
              site_name: (Array.isArray(req.site) ? (req.site[0] as { name: string } | undefined)?.name : (req.site as { name: string } | null)?.name) || '',
              tracking_token: req.tracking_token,
              status: newStatus,
            }),
          })
        }
      } catch { /* non-blocking */ }
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

    // Notify the other party: if commenter is creator → notify assignee, else notify creator
    if (wo) {
      const woNumber = wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : String(id).slice(0, 8)
      const notifyUserId = user.id === wo.created_by ? wo.assigned_to : wo.created_by
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const notifyEmail = user.id === wo.created_by ? (wo.assignee as any)?.email : null

      if (notifyUserId && notifyEmail) {
        fetch('/api/notifications/wo-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: notifyUserId,
            userEmail: notifyEmail,
            woNumber,
            woTitle: wo.title,
            woId: wo.id,
            newStatus: 'comment',
          }),
        }).catch(console.error)
      } else if (notifyUserId && user.id !== wo.created_by) {
        // Commenter is assignee → need to fetch creator email
        supabase.from('users').select('email').eq('id', wo.created_by).single().then(({ data: creator }) => {
          if (creator?.email) {
            fetch('/api/notifications/wo-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: wo.created_by,
                userEmail: creator.email,
                woNumber,
                woTitle: wo.title,
                woId: wo.id,
                newStatus: 'comment',
              }),
            }).catch(console.error)
          }
        })
      }
    }
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

  async function fetchInvoice() {
    if (!id) return
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('work_order_id', id)
      .maybeSingle()
    if (data) setExistingInvoice(data)
  }

  async function fetchActivities() {
    const { data } = await supabase.from('work_order_comments').select('*, user:user_id(full_name)').eq('work_order_id', id).order('created_at', { ascending: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // Notify WO creator about the activity (if different from current user)
    if (wo && wo.created_by && wo.created_by !== user?.id) {
      const { data: creator } = await supabase.from('users').select('email').eq('id', wo.created_by).single()
      if (creator?.email) {
        const woNumber = wo.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : wo.id.slice(0, 8)
        fetch('/api/notifications/wo-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: wo.created_by,
            userEmail: creator.email,
            woNumber,
            woTitle: wo.title,
            woId: wo.id,
            newStatus: 'activity',
          }),
        }).catch(console.error)
      }
    }

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

  if (loading) return <div className="p-8 text-on-surface-variant">Loading...</div>
  if (!wo) return <div className="p-8 text-on-surface-variant">Work order not found.</div>

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

  function statusActionClass(s: WorkOrderStatus): string {
    if (s === 'completed') return 'bg-primary text-on-primary border-0'
    if (s === 'closed') return 'bg-on-surface text-surface border-0'
    if (s === 'in_progress') return 'bg-secondary text-on-secondary border-0'
    return 'border border-outline-variant text-on-surface-variant bg-surface-container-lowest'
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[860px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <a href="/dashboard/work-orders" className="text-on-surface-variant text-sm hover:text-primary transition-colors">Back to Work Orders</a>
          <div className="flex gap-2">
            <a href={'/dashboard/work-orders/' + id + '/edit'}>
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors" style={{ padding: '6px 16px' }}>Edit</button>
            </a>
            <button onClick={() => window.print()} className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors" style={{ padding: '6px 16px' }}>Export PDF</button>
            {wo.status === 'completed' && wo.site?.invoicing_enabled && !existingInvoice && (
              <a href={`/dashboard/invoices/new?wo=${wo.id}`}>
                <button className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center gap-1.5" style={{ padding: '6px 16px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  {lang === 'ar' ? 'إنشاء فاتورة' : 'Generate Invoice'}
                </button>
              </a>
            )}
            {existingInvoice && (
              <button
                onClick={async () => {
                  const res = await fetch('/api/invoices/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ invoiceId: existingInvoice.id }),
                  })
                  const blob = await res.blob()
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${existingInvoice.invoice_number}.pdf`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors flex items-center gap-1.5" style={{ padding: '6px 16px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                {lang === 'ar' ? 'تحميل الفاتورة' : 'Download Invoice'}
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[22px] font-bold text-primary m-0">{translatedWO.title ?? wo.title}</h1>
              {wo.wo_number && (
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                  {`WO-${String(wo.wo_number).padStart(4, '0')}`}
                </span>
              )}
              {lang === 'ar' && (
                <TranslateButton
                  texts={{ title: wo.title, description: wo.description ?? '' }}
                  onTranslated={setTranslatedWO}
                />
              )}
            </div>
            {translatedWO.description && lang === 'ar' && (
              <p className="text-sm text-on-surface-variant mt-1.5 direction-rtl bg-surface-container-low px-3 py-2 rounded-xl w-full">
                {translatedWO.description}
              </p>
            )}
            <PriorityBadge priority={wo.priority} />
            <StatusBadge status={wo.status} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(wo as any).category && (
              <span className="text-xs bg-surface-container-low text-on-surface-variant px-2.5 py-0.5 rounded-full">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(wo as any).category}
              </span>
            )}
          </div>
          <p className="text-on-surface-variant text-sm mt-1.5">
            Created {format(new Date(wo.created_at), 'dd MMM yyyy, HH:mm')} · Updated {formatDistanceToNow(new Date(wo.updated_at), { addSuffix: true })}
          </p>
        </div>

        {sla && !['completed', 'closed'].includes(wo.status) && (
          <div className={
            sla.overdue
              ? 'bg-error/10 border border-error/30 rounded-xl px-4 py-3 flex items-center gap-3'
              : sla.hoursLeft < 24
                ? 'bg-[#f57f17]/10 border border-[#f57f17]/30 rounded-xl px-4 py-3 flex items-center gap-3'
                : 'bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 flex items-center gap-3'
          }>
            <span>{sla.overdue ? '🔴' : sla.hoursLeft < 24 ? '🟡' : '🟢'}</span>
            <p className={`m-0 text-sm font-semibold ${sla.overdue ? 'text-error' : sla.hoursLeft < 24 ? 'text-[#f57f17]' : 'text-primary'}`}>
              {sla.overdue ? `Overdue by ${sla.hoursPast} hours` : sla.hoursLeft < 24 ? `Due in ${sla.hoursLeft} hours` : `Due ${format(sla.due, 'dd MMM yyyy, HH:mm')}`}
            </p>
          </div>
        )}

        {mediaExpiry && mediaExpiry.warning && allPhotos.length > 0 && (
          <div className="bg-[#f57f17]/10 border border-[#f57f17]/20 rounded-xl px-4 py-3 text-sm text-[#f57f17]">
            Photos attached to this work order will be purged in {mediaExpiry.daysLeft} days ({format(mediaExpiry.expires, 'dd MMM yyyy')}). Download them before this date if needed.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { label: 'Asset', value: (wo.asset as any)?.name ?? '—' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { label: 'Site', value: (wo.site as any)?.name ?? '—' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { label: 'Assigned To', value: (wo.assignee as any)?.full_name ?? 'Unassigned' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { label: 'Category', value: (wo as any).category ?? '—' },
            { label: 'Started', value: wo.started_at ? format(new Date(wo.started_at), 'dd MMM yyyy, HH:mm') : '—' },
            { label: 'Completed', value: wo.completed_at ? format(new Date(wo.completed_at), 'dd MMM yyyy, HH:mm') : '—' },
            { label: 'SLA', value: wo.sla_hours ? `${wo.sla_hours} hours` : '—' },
            { label: 'Source', value: wo.source?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface-container-low rounded-xl px-4 py-3">
              <p className="text-xs text-on-surface-variant mb-1">{label}</p>
              <p className="text-sm font-medium text-on-surface m-0">{value}</p>
            </div>
          ))}
        </div>

        {wo.description && (
          <div className="bg-surface-container-low rounded-xl px-4 py-3">
            <p className="text-xs text-on-surface-variant mb-1.5">Description</p>
            <p className="text-sm m-0 leading-relaxed text-on-surface">{wo.description}</p>
          </div>
        )}

        {wo.completion_notes && (
          <div className="bg-surface-container-low rounded-xl px-4 py-3 border border-primary/20">
            <p className="text-xs text-primary mb-1.5">Digital Sign-off</p>
            <p className="text-sm m-0 text-on-surface">{wo.completion_notes}</p>
          </div>
        )}

        {nextStatuses[wo.status].length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 text-on-surface-variant">Update Status</p>
            <div className="flex gap-2 flex-wrap">
              {nextStatuses[wo.status].map(s => (
                <button
                  key={s}
                  onClick={() => updateStatus(s)}
                  disabled={updating}
                  className={`px-[18px] py-2 rounded-xl cursor-pointer text-sm font-medium transition-colors ${statusActionClass(s)}`}
                >
                  {updating ? '...' : `→ ${s.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {showSignoff && (
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
            <p className="text-[15px] font-semibold text-primary mb-3">Digital Sign-off Required</p>
            <p className="text-sm text-on-surface-variant mb-3">Enter your full name to confirm you have reviewed and approved this work order for closing.</p>
            <input
              value={signoffName}
              onChange={e => setSignoffName(e.target.value)}
              placeholder="Your full name"
              className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { if (signoffName.trim()) doStatusUpdate('closed', signoffName.trim()) }}
                disabled={!signoffName.trim() || updating}
                className={`bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors ${!signoffName.trim() || updating ? 'opacity-50' : ''}`}
              >
                {updating ? 'Closing...' : 'Confirm & Close Work Order'}
              </button>
              <button
                onClick={() => setShowSignoff(false)}
                className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="border-b border-outline-variant flex gap-0">
          {(
            [
              { key: 'comments', label: `Comments (${comments.length})` },
              { key: 'photos', label: `Photos (${allPhotos.length + closeoutPreviewUrls.length})` },
              { key: 'history', label: `History (${history.length})` },
              { key: 'parts', label: 'Parts Used' },
              { key: 'activity', label: `Activity Log (${activities.length})` },
            ] as { key: typeof activeTab; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm border-b-2 bg-transparent cursor-pointer transition-colors ${activeTab === key ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant'}`}
            >
              {label}
            </button>
          ))}
          {wo?.space_id && (
            <button
              onClick={() => setActiveTab('space_assets')}
              className={`px-4 py-2 text-sm border-b-2 bg-transparent cursor-pointer transition-colors ${activeTab === 'space_assets' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant'}`}
            >
              Space Assets
            </button>
          )}
        </div>

        {activeTab === 'comments' && (
          <div>
            {comments.length === 0 && <p className="text-sm text-on-surface-variant mb-3">No comments yet.</p>}
            {comments.map(c => (
              <div key={c.id} className="bg-surface-container-low rounded-xl px-4 py-3 mb-2">
                <p className="text-xs text-on-surface-variant mb-1">{c.user?.full_name ?? 'Unknown'} · {format(new Date(c.created_at), 'dd MMM yyyy, HH:mm')}</p>
                <p className="text-sm m-0 text-on-surface">{c.body}</p>
              </div>
            ))}
            <form onSubmit={addComment} className="flex gap-2 mt-3">
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment..." className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 flex-1" />
              <button type="submit" className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors">Post</button>
            </form>
          </div>
        )}

        {activeTab === 'photos' && (
          <div>
            {mediaExpiry && allPhotos.length > 0 && (
              <p className="text-xs text-on-surface-variant mb-3">
                Photos retained until {format(mediaExpiry.expires, 'dd MMM yyyy')} · {mediaExpiry.daysLeft} days remaining
              </p>
            )}
            <div className="flex gap-2.5 flex-wrap mb-6">
              {allPhotos.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={url} alt={`Photo ${i + 1}`} className="w-[120px] h-[120px] object-cover rounded-xl border border-outline-variant" />
              ))}
              {allPhotos.length === 0 && closeoutPreviewUrls.length === 0 && (
                <p className="text-sm text-on-surface-variant">No photos attached yet.</p>
              )}
            </div>
            {!['completed', 'closed'].includes(wo.status) && !isCloseHidden('closeout_photos') && (
              <div>
                <p className="text-sm font-medium text-on-surface-variant mb-2">
                  Add close-out photos
                  {isCloseReq('closeout_photos') && <span className="text-error"> *</span>}
                  {' '}
                  {wo.status === 'in_progress' && isCloseReq('closeout_photos') ? '(required before marking Completed)' : ''}
                </p>
                <input type="file" accept="image/*" multiple onChange={handleCloseoutPhoto} className="text-sm text-on-surface-variant" />
                {closeoutPreviewUrls.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-2.5">
                    {closeoutPreviewUrls.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt="" className="w-20 h-20 object-cover rounded-xl border border-outline-variant" />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {history.length === 0 && <p className="text-sm text-on-surface-variant">No history yet. Status changes will appear here.</p>}
            {history.map(h => (
              <div key={h.id} className="flex gap-3 mb-3 items-start">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <div>
                  <p className="text-sm m-0 font-medium text-on-surface">{h.action}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'parts' && (
          <div>
            <p className="text-sm text-on-surface-variant mb-4">Log parts and materials consumed on this work order. Stock levels are automatically deducted.</p>
            {partsUsed.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium text-on-surface mb-2">Parts logged this session:</p>
                {partsUsed.map((p, i) => (
                  <div key={i} className="bg-surface-container-low rounded-xl px-4 py-3 mb-1.5 flex justify-between">
                    <span className="text-sm text-on-surface">{p.qty} {p.unit} × {p.name}</span>
                    <span className="text-sm text-on-surface-variant">{p.cost ? 'SAR ' + p.cost.toFixed(2) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2.5 items-end flex-wrap">
              <div className="flex-[2] min-w-[200px]">
                <label className="block text-xs text-on-surface-variant mb-1">Select Part / Material</label>
                <select value={selectedPartId} onChange={e => setSelectedPartId(e.target.value)} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all">
                  <option value=''>Select inventory item...</option>
                  {inventoryItems.map(item => (
                    <option key={item.id} value={item.id}>{item.name} (Stock: {item.stock_quantity} {item.unit})</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[100px]">
                <label className="block text-xs text-on-surface-variant mb-1">Quantity Used</label>
                <input type='number' value={partQty} onChange={e => setPartQty(e.target.value)} min='0.01' step='0.01' placeholder='0' className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40" />
              </div>
              <button onClick={addPart} disabled={addingPart || !selectedPartId || !partQty} className={`bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors ${!selectedPartId || !partQty ? 'opacity-50' : ''}`}>
                {addingPart ? '...' : 'Log Parts'}
              </button>
            </div>
            {inventoryItems.length === 0 && (
              <p className="text-sm text-[#f57f17] mt-3">No inventory items found. <a href='/dashboard/inventory/new' className="text-primary hover:underline">Add items to inventory first.</a></p>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div>
            <p className="text-sm text-on-surface-variant mb-4">Log structured work updates — what was done, findings, or next steps.</p>
            <div className="mb-6">
              <div className="flex gap-2 mb-2 flex-wrap">
                {['update','finding','action','waiting','completed'].map(t => (
                  <button key={t} type='button' onClick={() => setActivityType(t)} className={`px-3.5 py-1.5 rounded-full border-2 cursor-pointer text-xs font-medium transition-colors ${activityType === t ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant bg-surface text-on-surface-variant'}`}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={activityText} onChange={e => setActivityText(e.target.value)} placeholder='Describe what was done or found...' className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 flex-1" />
                <button onClick={addActivity} disabled={addingActivity || !activityText.trim()} className={`bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors ${!activityText.trim() ? 'opacity-50' : ''}`}>
                  {addingActivity ? '...' : 'Log Activity'}
                </button>
              </div>
            </div>
            {activities.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No activity logged yet. Use the form above to record work updates.</p>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              activities.map((a: any) => {
                const body = a.body.replace('[ACTIVITY] ', '')
                const typeMatch = body.match(/^\[(\w+)\]/)
                const type = typeMatch ? typeMatch[1].toLowerCase() : 'update'
                const text = body.replace(/^\[\w+\] /, '')
                const typeBadgeClass: Record<string, string> = {
                  update:    'bg-secondary/10 text-secondary',
                  finding:   'bg-[#f57f17]/10 text-[#f57f17]',
                  action:    'bg-primary/10 text-primary',
                  waiting:   'bg-error/10 text-error',
                  completed: 'bg-primary/10 text-primary',
                  parts:     'bg-tertiary/10 text-tertiary',
                }
                const badgeClass = typeBadgeClass[type] ?? typeBadgeClass.update
                return (
                  <div key={a.id} className="bg-surface-container-low rounded-xl px-4 py-3 mb-2 flex gap-3 items-start">
                    <span className={`${badgeClass} px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap mt-0.5`}>
                      {type.toUpperCase()}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm m-0 text-on-surface">{text}</p>
                      <p className="text-[11px] text-on-surface-variant mt-1">
                        {a.user?.full_name ?? 'Unknown'} · {new Date(a.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'space_assets' && wo?.space_id && (
          <SpaceAssetsPanel spaceId={wo.space_id} woId={wo.id} supabase={supabase} />
        )}
      </div>
    </div>
  )
}

function SpaceAssetsPanel({ spaceId, woId, supabase }: { spaceId: string; woId: string; supabase: ReturnType<typeof createClient> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assets, setAssets] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [space, setSpace] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: sp } = await supabase.from('spaces').select('name, floor').eq('id', spaceId).single()
      if (sp) setSpace(sp)
      const { data } = await supabase.from('assets').select('*').eq('space_id', spaceId)
      if (data) setAssets(data)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId])

  async function changeStatus(assetId: string, assetName: string, newStatus: 'online' | 'offline') {
    const label = newStatus === 'online' ? 'Commissioned' : 'Decommissioned'
    if (!confirm(`Mark "${assetName}" as ${newStatus}?`)) return
    await supabase.from('assets').update({ status: newStatus }).eq('id', assetId)
    await supabase.from('work_order_comments').insert({
      work_order_id: woId,
      body: `[ACTIVITY] [ACTION] ${label} asset: ${assetName}`,
    })
    const { data } = await supabase.from('assets').select('*').eq('space_id', spaceId)
    if (data) setAssets(data)
  }

  return (
    <div>
      {space && (
        <p className="text-sm text-on-surface-variant mb-4">
          {space.name} · {space.floor}
        </p>
      )}
      {assets.length === 0 ? (
        <p className="text-on-surface-variant">No assets assigned to this space.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Name','Category','Status',''].map(h => (
                <th key={h} className="px-3.5 py-2 text-left text-[11px] font-bold text-on-surface-variant uppercase tracking-widest border-b border-outline-variant">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map(asset => (
              <tr key={asset.id}>
                <td className="px-3.5 py-2.5 text-sm text-on-surface-variant border-b border-outline-variant">{asset.name}</td>
                <td className="px-3.5 py-2.5 text-sm text-on-surface-variant border-b border-outline-variant">{asset.category}</td>
                <td className="px-3.5 py-2.5 text-sm border-b border-outline-variant">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${asset.status === 'online' ? 'bg-primary/10 text-primary' : 'bg-surface-container-low text-on-surface-variant'}`}>
                    {asset.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td className="px-3.5 py-2.5 text-sm border-b border-outline-variant whitespace-nowrap">
                  <button
                    onClick={() => changeStatus(asset.id, asset.name, 'online')}
                    disabled={asset.status === 'online'}
                    className={`text-xs px-2.5 py-1 mr-1.5 border border-outline-variant rounded-lg transition-colors ${asset.status === 'online' ? 'cursor-not-allowed text-on-surface-variant opacity-50 bg-surface' : 'cursor-pointer text-primary hover:bg-primary/10 bg-surface'}`}
                  >
                    Commission
                  </button>
                  <button
                    onClick={() => changeStatus(asset.id, asset.name, 'offline')}
                    disabled={asset.status === 'offline'}
                    className={`text-xs px-2.5 py-1 border border-outline-variant rounded-lg transition-colors ${asset.status === 'offline' ? 'cursor-not-allowed text-on-surface-variant opacity-50 bg-surface' : 'cursor-pointer text-error hover:bg-error/10 bg-surface'}`}
                  >
                    Decommission
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
