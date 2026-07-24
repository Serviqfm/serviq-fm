'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { WorkOrder, WorkOrderStatus, WorkOrderTask } from '@/types/work-order'
import PriorityBadge from '@/components/PriorityBadge'
import StatusBadge from '@/components/StatusBadge'
import { format, formatDistanceToNow, isAfter, differenceInHours, differenceInDays } from 'date-fns'
import { useParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import TranslateButton from '@/components/TranslateButton'
import { sendPushNotification } from '@/lib/push'
import { usePollingRefresh } from '@/lib/usePollingRefresh'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'
import WorkOrderFilesTab from '@/components/work-orders/WorkOrderFilesTab'
import WarrantyClaimsTab from '@/components/work-orders/WarrantyClaimsTab'
import { CustomFieldDefinition, fieldLabel } from '@/lib/customFields'

type CustomStatusOption = {
  id: string
  name: string
  name_ar: string | null
  color: string | null
  maps_to_base_status: WorkOrderStatus
}

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
  const [activeTab, setActiveTab] = useState<'tasks' | 'comments' | 'history' | 'photos' | 'files' | 'parts' | 'labor' | 'costs' | 'activity' | 'space_assets' | 'warranty'>('comments')
  const [tasks, setTasks] = useState<WorkOrderTask[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string } | null>(null)
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([])
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
  // MKT-15: optional failure code applied at closure (SQL Files/w6-1-failure-codes.sql).
  const [failureCodes, setFailureCodes] = useState<{ id: string; code: string; label: string; label_ar: string | null }[]>([])
  const [failureCodeId, setFailureCodeId] = useState('')
  // WO-30: close-out notes captured when marking a WO Completed.
  const [closeoutNotes, setCloseoutNotes] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [existingInvoice, setExistingInvoice] = useState<any>(null)
  const [additionalWorkerNames, setAdditionalWorkerNames] = useState<string[]>([])
  // WO-25: org-defined custom statuses (display sub-states mapped to a base status).
  const [customStatuses, setCustomStatuses] = useState<CustomStatusOption[]>([])
  // WO-24: related work orders (links to/from this WO).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [links, setLinks] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [linkableWOs, setLinkableWOs] = useState<any[]>([])
  const [newLinkType, setNewLinkType] = useState<'blocks' | 'duplicate_of' | 'related'>('related')
  const [newLinkTarget, setNewLinkTarget] = useState('')
  const [addingLink, setAddingLink] = useState(false)
  // WO-06 labor time logs + WO-07 additional costs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [timeLogs, setTimeLogs] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [costs, setCosts] = useState<any[]>([])
  const [logMinutes, setLogMinutes] = useState('')
  const [logNote, setLogNote] = useState('')
  const [addingTimeLog, setAddingTimeLog] = useState(false)
  const [costDesc, setCostDesc] = useState('')
  const [costAmount, setCostAmount] = useState('')
  const [costCategory, setCostCategory] = useState('')
  const [addingCost, setAddingCost] = useState(false)
  useEffect(() => {
    fetchWorkOrder()
    fetchComments()
    fetchHistory()
    fetchInventory()
    fetchActivities()
    fetchInvoice()
    fetchTasks()
    fetchCurrentUser()
    fetchCustomStatuses()
    fetchFailureCodes()
    fetchLinks()
    fetchLinkableWOs()
    fetchTimeLogs()
    fetchCosts()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // DV-29: refresh the WO + its comments/activity so status/assignment changes made
  // by others surface without a manual reload.
  usePollingRefresh(() => { fetchWorkOrder(); fetchComments(); fetchActivities() })

  // Tables may not exist yet (migration not applied) — errors leave lists empty.
  async function fetchTimeLogs() {
    const { data } = await supabase
      .from('work_order_time_logs')
      .select('*, user:user_id(full_name)')
      .eq('work_order_id', id)
      .order('logged_at', { ascending: false })
    if (data) setTimeLogs(data)
  }

  async function fetchCosts() {
    const { data } = await supabase
      .from('work_order_costs')
      .select('*')
      .eq('work_order_id', id)
      .order('created_at', { ascending: false })
    if (data) setCosts(data)
  }

  async function addTimeLog(e: React.FormEvent) {
    e.preventDefault()
    const mins = parseInt(logMinutes, 10)
    if (!mins || mins <= 0 || !wo) return
    setAddingTimeLog(true)
    const { data: { user } } = await supabase.auth.getUser()
    // Snapshot the technician's current hourly_rate (1C-15) so a later rate change
    // does not retroactively re-price this labor.
    let rate: number | null = null
    if (user) {
      const { data: profile } = await supabase.from('users').select('hourly_rate').eq('id', user.id).single()
      rate = profile?.hourly_rate ?? null
    }
    await supabase.from('work_order_time_logs').insert({
      organisation_id: wo.organisation_id,
      work_order_id: id,
      user_id: user?.id ?? null,
      minutes: mins,
      hourly_rate: rate,
      note: logNote.trim() || null,
      created_by: user?.id ?? null,
    })
    setLogMinutes('')
    setLogNote('')
    await fetchTimeLogs()
    setAddingTimeLog(false)
  }

  async function addCost(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(costAmount)
    if (!costDesc.trim() || isNaN(amt) || amt < 0 || !wo) return
    setAddingCost(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('work_order_costs').insert({
      organisation_id: wo.organisation_id,
      work_order_id: id,
      description: costDesc.trim(),
      amount: amt,
      category: costCategory.trim() || null,
      created_by: user?.id ?? null,
    })
    setCostDesc('')
    setCostAmount('')
    setCostCategory('')
    await fetchCosts()
    setAddingCost(false)
  }

  async function fetchCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('id, role').eq('id', user.id).single()
    if (profile) setCurrentUser(profile)
  }

  async function fetchCustomStatuses() {
    // Table may not exist yet (migration not applied) — any error just leaves the list empty.
    const { data } = await supabase
      .from('work_order_custom_statuses')
      .select('id, name, name_ar, color, maps_to_base_status')
      .eq('is_active', true)
      .order('sort_order')
    if (data) setCustomStatuses(data as CustomStatusOption[])
  }

  async function fetchFailureCodes() {
    // MKT-15: table may not exist yet (migration not applied) — errors leave the list empty.
    const { data } = await supabase
      .from('failure_codes')
      .select('id, code, label, label_ar')
      .eq('is_active', true)
      .order('code')
    if (data) setFailureCodes(data)
  }

  async function fetchLinks() {
    // Route degrades to [] when the work_order_links table is absent.
    const res = await fetch(`/api/work-orders/${id}/links`).catch(() => null)
    if (!res?.ok) return
    const json = await res.json().catch(() => ({ links: [] }))
    setLinks(json.links ?? [])
  }

  async function fetchLinkableWOs() {
    // Lightweight picker source: recent org WOs (RLS scopes to the caller's org).
    // ponytail: cap at 200; add a typeahead search if orgs outgrow that.
    const { data } = await supabase
      .from('work_orders')
      .select('id, wo_number, title')
      .neq('id', id as string)
      .order('wo_number', { ascending: false })
      .limit(200)
    if (data) setLinkableWOs(data)
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault()
    if (!newLinkTarget) return
    setAddingLink(true)
    const res = await fetch(`/api/work-orders/${id}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_wo_id: newLinkTarget, link_type: newLinkType }),
    }).catch(() => null)
    setAddingLink(false)
    if (!res?.ok) {
      const json = await res?.json().catch(() => ({}))
      alert(json?.error ?? 'Failed to add link')
      return
    }
    setNewLinkTarget('')
    fetchLinks()
  }

  async function removeLink(linkId: string) {
    await fetch(`/api/work-orders/${id}/links?link_id=${linkId}`, { method: 'DELETE' }).catch(() => null)
    fetchLinks()
  }

  async function fetchTasks() {
    const { data } = await supabase
      .from('work_order_tasks')
      .select('*, done_by_user:done_by(full_name)')
      .eq('work_order_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (data) setTasks(data as WorkOrderTask[])
  }

  async function toggleTask(task: WorkOrderTask) {
    const { data: { user } } = await supabase.auth.getUser()
    const nowDone = !task.is_done
    // Optimistic update so the checkbox feels instant
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, is_done: nowDone } : t))
    await supabase.from('work_order_tasks').update({
      is_done: nowDone,
      done_by: nowDone ? user?.id ?? null : null,
      done_at: nowDone ? new Date().toISOString() : null,
    }).eq('id', task.id)
    fetchTasks()
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newTaskTitle.trim() || !wo) return
    setAddingTask(true)
    await supabase.from('work_order_tasks').insert({
      organisation_id: wo.organisation_id,
      work_order_id: id,
      title: newTaskTitle.trim(),
      sort_order: tasks.length,
    })
    setNewTaskTitle('')
    await fetchTasks()
    setAddingTask(false)
  }

  async function deleteTask(taskId: string) {
    if (!confirm(lang === 'ar' ? 'حذف هذه المهمة؟' : 'Delete this task?')) return
    await supabase.from('work_order_tasks').delete().eq('id', taskId)
    fetchTasks()
  }

  async function fetchWorkOrder() {
    const { data } = await supabase
      .from('work_orders')
      .select('*, assignee:assigned_to(full_name, email), vendor:assigned_vendor_id(company_name), asset:asset_id(name, warranty_expiry), site:site_id(name, invoicing_enabled), team:team_id(name, name_ar)')
      .eq('id', id)
      .single()
    if (data) {
      setWo(data as WorkOrder)
      // Resolve additional worker names (uuid[] column → user full names)
      const workerIds: string[] = Array.isArray(data.additional_workers) ? data.additional_workers : []
      if (workerIds.length > 0) {
        const { data: workers } = await supabase.from('users').select('id, full_name').in('id', workerIds)
        if (workers) setAdditionalWorkerNames(workers.map(w => w.full_name).filter(Boolean))
      } else {
        setAdditionalWorkerNames([])
      }
      // WO-26: load active custom-field definitions to label/order the stored values.
      const { data: defs } = await supabase
        .from('custom_field_definitions')
        .select('*')
        .eq('organisation_id', data.organisation_id)
        .eq('entity', 'work_order')
        .eq('is_active', true)
        .order('sort_order')
      if (defs) setCustomFieldDefs(defs as CustomFieldDefinition[])
    }
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

  async function saveAsTemplate() {
    if (!wo) return
    const name = window.prompt(lang === 'ar' ? 'اسم القالب؟' : 'Template name?')
    if (name === null) return
    if (!name.trim()) { alert(lang === 'ar' ? 'الاسم مطلوب' : 'A name is required'); return }
    const { data: tasks } = await supabase.from('work_order_tasks').select('title, title_ar, sort_order').eq('work_order_id', id).order('sort_order')
    const { error } = await supabase.from('work_order_templates').insert({
      organisation_id: wo.organisation_id,
      name: name.trim(),
      title: wo.title ?? null,
      description: wo.description ?? null,
      priority: wo.priority ?? null,
      category: wo.category ?? null,
      asset_id: wo.asset_id ?? null,
      assigned_to: wo.assigned_to ?? null,
      estimated_duration_minutes: wo.estimated_duration_minutes ?? null,
      tasks: (tasks ?? []).map((t: { title: string; title_ar: string | null }) => ({ title: t.title, ...(t.title_ar ? { title_ar: t.title_ar } : {}) })),
    })
    if (error) { alert((lang === 'ar' ? 'فشل حفظ القالب: ' : 'Failed to save template: ') + error.message); return }
    alert(lang === 'ar' ? 'تم حفظ القالب.' : 'Template saved.')
  }

  // WO-12: managers archive closed/completed WOs (hidden from the default list);
  // Unarchive on an archived WO restores it.
  async function toggleArchive() {
    if (!wo) return
    const archiving = !wo.archived_at
    if (archiving && !confirm(lang === 'ar' ? 'أرشفة أمر العمل هذا؟ سيتم إخفاؤه من القائمة الافتراضية.' : 'Archive this work order? It will be hidden from the default list.')) return
    setUpdating(true)
    const archived_at = archiving ? new Date().toISOString() : null
    const { error } = await supabase.from('work_orders')
      .update({ archived_at, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      alert((lang === 'ar' ? 'فشلت العملية: ' : 'Failed: ') + error.message)
      setUpdating(false)
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('audit_logs').insert({
      entity_type: 'work_order',
      entity_id: id,
      action: archiving ? 'Work order archived' : 'Work order unarchived',
      user_id: user?.id,
      organisation_id: wo.organisation_id,
      new_values: { archived_at },
      old_values: { archived_at: wo.archived_at ?? null },
      impersonated_by: null,
    })
    await fetchWorkOrder()
    await fetchHistory()
    setUpdating(false)
  }

  async function reopenWO() {
    // CORE-03: manager/admin reopen with a mandatory reason.
    const reason = window.prompt('Reason for reopening this work order?')
    if (reason === null) return
    if (reason.trim().length < 3) { alert('A reason (at least 3 characters) is required to reopen.'); return }
    setUpdating(true)
    const res = await fetch(`/api/work-orders/${id}/reopen`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error ?? 'Failed to reopen work order')
      setUpdating(false)
      return
    }
    window.location.reload()
  }

  // WO-25: customStatusId is the optional display sub-state; base `newStatus` is always
  // one of the 6 legal statuses so the CORE-20 lifecycle trigger keeps working.
  async function updateStatus(newStatus: WorkOrderStatus, customStatusId: string | null = null) {
    if (newStatus === 'closed') {
      setShowSignoff(true)
      return
    }
    if (newStatus === 'completed' && isCloseReq('closeout_photos') && closeoutPhotos.length === 0) {
      alert('Please attach at least one close-out photo before marking as completed.')
      setActiveTab('photos')
      return
    }
    if (newStatus === 'completed' && isCloseReq('completion_notes') && !closeoutNotes.trim()) {
      alert('Please enter close-out notes before marking as completed.')
      return
    }
    await doStatusUpdate(newStatus, undefined, customStatusId)
  }

  async function doStatusUpdate(newStatus: WorkOrderStatus, signoff?: string, customStatusId: string | null = null) {
    setUpdating(true)
    const { data: { user } } = await supabase.auth.getUser()

    const closeoutPhotoUrls: string[] = []
    if (closeoutPhotos.length > 0 && wo) {
      // Upload via server endpoint so we bypass storage.objects RLS — the server uses the
      // service-role key and enforces org-scoping in app code.
      for (const file of closeoutPhotos) {
        const fd = new FormData()
        fd.append('file', file)
        const params = new URLSearchParams({
          bucket: 'work-order-media',
          prefix: `${wo.organisation_id}/${id}`,
        })
        const res = await fetch(`/api/upload?${params.toString()}`, { method: 'POST', body: fd })
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: 'unknown error' }))
          alert(`Failed to upload "${file.name}": ${j.error ?? 'unknown error'}. The work order was not updated.`)
          setUpdating(false)
          return
        }
        const { publicUrl } = await res.json()
        closeoutPhotoUrls.push(publicUrl)
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
          completion_notes: closeoutNotes.trim() || undefined,
          // MKT-15: optional failure code, captured in the close sign-off panel.
          failure_code_id: newStatus === 'closed' && failureCodeId ? failureCodeId : undefined,
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
        // WO-25: set/clear the display sub-state together with the base status.
        custom_status_id: customStatusId,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'in_progress' ? { started_at: new Date().toISOString() } : {}),
        ...(closeoutPhotoUrls.length > 0 ? { photo_urls: allPhotos } : {}),
      }).eq('id', id)

      // TODO(sprint-f): move audit log write to server route for impersonation attribution
      await supabase.from('audit_logs').insert({
        entity_type: 'work_order',
        entity_id: id,
        action: `Status changed to ${newStatus}`,
        user_id: user?.id,
        organisation_id: wo?.organisation_id,
        new_values: { status: newStatus },
        old_values: { status: wo?.status },
        impersonated_by: null,
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
    setCloseoutNotes('')
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

  // FM-24: Warranty tab shows when the WO's asset is still under warranty, or always
  // for admin/manager. Only managers can create claims / move their status.
  const isWarrantyManager = ['admin', 'manager'].includes(currentUser?.role ?? '')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assetWarrantyExpiry = (wo.asset as any)?.warranty_expiry as string | null | undefined
  const assetUnderWarranty = !!assetWarrantyExpiry && new Date(assetWarrantyExpiry) >= new Date()
  const showWarranty = isWarrantyManager || assetUnderWarranty

  // WO-06/07 cost roll-up. Parts cost is parsed from the persisted "Parts used"
  // activity comments (the only place parts consumption is stored today).
  const money = (n: number) => `SAR ${n.toFixed(2)}`
  const laborCost = timeLogs.reduce((s, t) => s + (t.hourly_rate ? (t.minutes / 60) * Number(t.hourly_rate) : 0), 0)
  const additionalCost = costs.reduce((s, c) => s + Number(c.amount || 0), 0)
  const partsCost = activities.reduce((s, a) => {
    const m = a.body.match(/Parts used:.*\(SAR ([\d.]+)\)/)
    return s + (m ? parseFloat(m[1]) : 0)
  }, 0)
  const woTotal = laborCost + partsCost + additionalCost

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

  // WO-24: relationship label from this WO's perspective (inverse for incoming rows).
  function linkLabel(type: string, direction: string): string {
    const en: Record<string, string> = {
      'blocks:out': 'Blocks', 'blocks:in': 'Blocked by',
      'duplicate_of:out': 'Duplicate of', 'duplicate_of:in': 'Duplicated by',
      'related:out': 'Related to', 'related:in': 'Related to',
    }
    const ar: Record<string, string> = {
      'blocks:out': 'يمنع', 'blocks:in': 'ممنوع بواسطة',
      'duplicate_of:out': 'مكرر لـ', 'duplicate_of:in': 'مكرر بواسطة',
      'related:out': 'مرتبط بـ', 'related:in': 'مرتبط بـ',
    }
    const key = `${type}:${direction}`
    return (lang === 'ar' ? ar[key] : en[key]) ?? type
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[860px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <a href="/dashboard/work-orders" className="text-on-surface-variant text-sm hover:text-primary transition-colors">Back to Work Orders</a>
          <div className="flex gap-2">
            {/* CORE-02: closed work orders are immutable — no Edit affordance. */}
            {wo.status !== 'closed' && (
              <a href={'/dashboard/work-orders/' + id + '/edit'}>
                <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors" style={{ padding: '6px 16px' }}>Edit</button>
              </a>
            )}
            {/* WO-09 duplicate: prefill the create form from this WO. */}
            <a href={'/dashboard/work-orders/new?duplicate_from=' + id}>
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors" style={{ padding: '6px 16px' }}>{lang === 'ar' ? 'تكرار' : 'Duplicate'}</button>
            </a>
            {/* WO-12: archive/unarchive — managers only; archive offered on completed/closed WOs. */}
            {['admin', 'manager'].includes(currentUser?.role ?? '') && (wo.archived_at || ['completed', 'closed'].includes(wo.status)) && (
              <button onClick={toggleArchive} disabled={updating} className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors" style={{ padding: '6px 16px' }}>
                {wo.archived_at ? (lang === 'ar' ? 'إلغاء الأرشفة' : 'Unarchive') : (lang === 'ar' ? 'أرشفة' : 'Archive')}
              </button>
            )}
            {/* WO-08 convert-to-template. */}
            <button onClick={saveAsTemplate} className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors" style={{ padding: '6px 16px' }}>{lang === 'ar' ? 'حفظ كقالب' : 'Save as Template'}</button>
            <button onClick={async () => {
              const res = await fetch(`/api/reports/work-order/${id}`)
              if (!res.ok) { alert('Export failed.'); return }
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `WO-${wo?.wo_number ?? id}.pdf`
              a.click()
              URL.revokeObjectURL(url)
            }} className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors" style={{ padding: '6px 16px' }}>Export PDF</button>
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
            {/* WO-12: archived indicator */}
            {wo.archived_at && (
              <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container-low text-on-surface-variant border border-outline-variant">
                {lang === 'ar' ? 'مؤرشف' : 'Archived'}
              </span>
            )}
            {/* WO-25: show the custom sub-state only when it still maps to the current base
                status (hides a stale sub-state left by a completed/closed transition). */}
            {(() => {
              const cs = customStatuses.find(c => c.id === wo.custom_status_id && c.maps_to_base_status === wo.status)
              if (!cs) return null
              return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
                  style={{ borderColor: cs.color ?? '#6b7280', color: cs.color ?? '#6b7280' }}>
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: cs.color ?? '#6b7280' }} />
                  {lang === 'ar' && cs.name_ar ? cs.name_ar : cs.name}
                </span>
              )
            })()}
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
            { label: 'Assigned To', value: (wo.assignee as any)?.full_name ?? ((wo.vendor as any)?.company_name ? `${(wo.vendor as any).company_name} (Vendor)` : 'Unassigned') },
            ...((wo as any).signed_off_by
              ? [{ label: lang === 'ar' ? 'تم الاعتماد بواسطة' : 'Signed Off By', value: (wo as any).signed_off_by }]
              : []),
            ...(wo.team
              ? [{ label: lang === 'ar' ? 'الفريق' : 'Team', value: lang === 'ar' && wo.team.name_ar ? wo.team.name_ar : wo.team.name }]
              : []),
            ...(additionalWorkerNames.length > 0
              ? [{ label: lang === 'ar' ? 'عمال إضافيون' : 'Additional Workers', value: additionalWorkerNames.join(', ') }]
              : []),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { label: 'Category', value: (wo as any).category ?? '—' },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...((wo as any).start_at
              ? [{ label: lang === 'ar' ? 'البدء المخطط' : 'Planned Start', value: format(new Date((wo as any).start_at), 'dd MMM yyyy, HH:mm') }]
              : []),
            { label: 'Started', value: wo.started_at ? format(new Date(wo.started_at), 'dd MMM yyyy, HH:mm') : '—' },
            { label: 'Completed', value: wo.completed_at ? format(new Date(wo.completed_at), 'dd MMM yyyy, HH:mm') : '—' },
            { label: 'SLA', value: wo.sla_hours ? `${wo.sla_hours} hours` : '—' },
            ...(wo.estimated_duration_minutes
              ? [{ label: lang === 'ar' ? 'المدة المقدرة' : 'Est. Duration', value: `${wo.estimated_duration_minutes} ${lang === 'ar' ? 'دقيقة' : 'min'}` }]
              : []),
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

        {/* WO-26: org-defined custom-field values (labelled/ordered by active definitions). */}
        {(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cf = ((wo as any).custom_fields ?? {}) as Record<string, unknown>
          const rows = customFieldDefs
            .map(def => ({ def, value: cf[def.key] }))
            .filter(({ value }) => value !== undefined && value !== null && value !== '')
          if (rows.length === 0) return null
          return (
            <div className="grid grid-cols-2 gap-3">
              {rows.map(({ def, value }) => (
                <div key={def.id} className="bg-surface-container-low rounded-xl px-4 py-3">
                  <p className="text-xs text-on-surface-variant mb-1">{fieldLabel(def, lang)}</p>
                  <p className="text-sm font-medium text-on-surface m-0">{String(value)}</p>
                </div>
              ))}
            </div>
          )
        })()}

        {wo.completion_notes && (
          <div className="bg-surface-container-low rounded-xl px-4 py-3 border border-primary/20">
            <p className="text-xs text-primary mb-1.5">{lang === 'ar' ? 'ملاحظات الإنجاز' : 'Completion Notes'}</p>
            <p className="text-sm m-0 text-on-surface">{wo.completion_notes}</p>
          </div>
        )}

        {/* WO-30: close-out notes captured at completion (configurable via Form Fields > Close Work Order). */}
        {!['completed', 'closed'].includes(wo.status) && !isCloseHidden('completion_notes') && (
          <div className="bg-surface-container-low rounded-xl px-4 py-3 border border-outline-variant/40">
            <label className="text-xs text-on-surface-variant mb-1.5 block">
              {lang === 'ar' ? 'ملاحظات الإغلاق' : 'Close-out notes'}
              {isCloseReq('completion_notes') && <span className="text-error"> *</span>}
              <span className="text-on-surface-variant/60"> {lang === 'ar' ? '(تُحفظ عند الإنجاز)' : '(saved when marking Completed)'}</span>
            </label>
            <textarea
              value={closeoutNotes}
              onChange={e => setCloseoutNotes(e.target.value)}
              rows={3}
              placeholder={lang === 'ar' ? 'ماذا تم إنجازه؟' : 'What was done to resolve this?'}
              className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40"
            />
          </div>
        )}

        {(() => {
          const isManager = ['admin', 'manager'].includes(currentUser?.role ?? '')
          // CORE-01: only managers/admins can move a WO to `closed`.
          const transitions = nextStatuses[wo.status].filter(s => s !== 'closed' || isManager)
          const canReopen = isManager && ['completed', 'closed'].includes(wo.status)
          // WO-25: custom statuses whose base maps to an available transition. Picking one
          // writes both custom_status_id and the base status (via updateStatus's 2nd arg).
          const customTransitions = customStatuses.filter(cs => transitions.includes(cs.maps_to_base_status))
          if (transitions.length === 0 && customTransitions.length === 0 && !canReopen) return null
          return (
            <div>
              <p className="text-sm font-medium mb-2 text-on-surface-variant">Update Status</p>
              <div className="flex gap-2 flex-wrap">
                {transitions.map(s => (
                  <button
                    key={s}
                    onClick={() => updateStatus(s)}
                    disabled={updating}
                    className={`px-[18px] py-2 rounded-xl cursor-pointer text-sm font-medium transition-colors ${statusActionClass(s)}`}
                  >
                    {updating ? '...' : `→ ${s.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}`}
                  </button>
                ))}
                {customTransitions.map(cs => (
                  <button
                    key={cs.id}
                    onClick={() => updateStatus(cs.maps_to_base_status, cs.id)}
                    disabled={updating}
                    className="px-[18px] py-2 rounded-xl cursor-pointer text-sm font-medium transition-colors border"
                    style={{ borderColor: cs.color ?? '#6b7280', color: cs.color ?? '#6b7280' }}
                  >
                    {updating ? '...' : `→ ${lang === 'ar' && cs.name_ar ? cs.name_ar : cs.name}`}
                  </button>
                ))}
                {canReopen && (
                  <button
                    onClick={reopenWO}
                    disabled={updating}
                    className="px-[18px] py-2 rounded-xl cursor-pointer text-sm font-medium transition-colors bg-[#fff8e1] text-[#f57f17] hover:bg-[#ffecb3]"
                  >
                    {updating ? '...' : '↩ Reopen'}
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        {showSignoff && (
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-6">
            <p className="text-[15px] font-semibold text-primary mb-3">Digital Sign-off Required</p>
            <p className="text-sm text-on-surface-variant mb-3">Enter your full name to confirm you have reviewed and approved this work order for closing.</p>
            {/* MKT-15: optional failure code for reliability reporting (hidden when the org has none). */}
            {failureCodes.length > 0 && (
              <div className="mb-3">
                <label className="text-xs text-on-surface-variant mb-1.5 block">
                  {lang === 'ar' ? 'رمز العطل (اختياري)' : 'Failure code (optional)'}
                </label>
                <select
                  value={failureCodeId}
                  onChange={e => setFailureCodeId(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                >
                  <option value="">{lang === 'ar' ? '— بدون —' : '— None —'}</option>
                  {failureCodes.map(fc => (
                    <option key={fc.id} value={fc.id}>
                      {fc.code} — {lang === 'ar' && fc.label_ar ? fc.label_ar : fc.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
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

        {/* WO-24: related work orders (links to/from this WO; informational). */}
        <div className="bg-surface-container-low rounded-xl px-4 py-3">
          <p className="text-xs text-on-surface-variant mb-2">{lang === 'ar' ? 'أوامر العمل ذات الصلة' : 'Related work orders'}</p>
          {links.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {links.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm min-w-0">
                    <span className="text-xs font-semibold text-on-surface-variant shrink-0">{linkLabel(l.link_type, l.direction)}</span>
                    <a href={`/dashboard/work-orders/${l.other.id}`} className="text-primary hover:underline truncate">
                      {l.other.wo_number ? `#${l.other.wo_number}` : ''} {l.other.title}
                    </a>
                  </div>
                  <button onClick={() => removeLink(l.id)} className="text-xs text-on-surface-variant hover:text-error shrink-0" aria-label={lang === 'ar' ? 'إزالة' : 'Remove'}>✕</button>
                </div>
              ))}
            </div>
          )}
          {links.length === 0 && <p className="text-sm text-on-surface-variant/60 mb-3 m-0">{lang === 'ar' ? 'لا توجد روابط بعد.' : 'No links yet.'}</p>}
          {wo.status !== 'closed' && (
            <form onSubmit={addLink} className="flex flex-wrap gap-2 items-center">
              <select value={newLinkType} onChange={e => setNewLinkType(e.target.value as typeof newLinkType)} className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface outline-none">
                <option value="related">{lang === 'ar' ? 'مرتبط بـ' : 'Related to'}</option>
                <option value="blocks">{lang === 'ar' ? 'يمنع' : 'Blocks'}</option>
                <option value="duplicate_of">{lang === 'ar' ? 'مكرر لـ' : 'Duplicate of'}</option>
              </select>
              <select value={newLinkTarget} onChange={e => setNewLinkTarget(e.target.value)} className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface outline-none flex-1 min-w-[180px]">
                <option value="">{lang === 'ar' ? 'اختر أمر عمل…' : 'Select a work order…'}</option>
                {linkableWOs.map(w => (
                  <option key={w.id} value={w.id}>{w.wo_number ? `#${w.wo_number}` : ''} {w.title}</option>
                ))}
              </select>
              <button type="submit" disabled={!newLinkTarget || addingLink} className={`bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors ${!newLinkTarget || addingLink ? 'opacity-50' : ''}`}>
                {addingLink ? '…' : (lang === 'ar' ? 'ربط' : 'Link')}
              </button>
            </form>
          )}
        </div>

        <div className="border-b border-outline-variant flex gap-0">
          {(
            [
              { key: 'tasks', label: `${lang === 'ar' ? 'المهام' : 'Tasks'} (${tasks.filter(t2 => t2.is_done).length}/${tasks.length})` },
              { key: 'comments', label: `Comments (${comments.length})` },
              { key: 'photos', label: `Photos (${allPhotos.length + closeoutPreviewUrls.length})` },
              { key: 'files', label: lang === 'ar' ? 'الملفات' : 'Files' },
              { key: 'history', label: `History (${history.length})` },
              { key: 'parts', label: 'Parts Used' },
              { key: 'labor', label: `${lang === 'ar' ? 'العمالة' : 'Labor'} (${timeLogs.length})` },
              { key: 'costs', label: `${lang === 'ar' ? 'التكاليف' : 'Costs'} (${costs.length})` },
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
          {showWarranty && (
            <button
              onClick={() => setActiveTab('warranty')}
              className={`px-4 py-2 text-sm border-b-2 bg-transparent cursor-pointer transition-colors ${activeTab === 'warranty' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant'}`}
            >
              {lang === 'ar' ? 'الضمان' : 'Warranty'}
            </button>
          )}
        </div>

        {activeTab === 'tasks' && (
          <div>
            {tasks.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-on-surface-variant m-0">
                    {lang === 'ar'
                      ? `اكتمل ${tasks.filter(t2 => t2.is_done).length}/${tasks.length}`
                      : `${tasks.filter(t2 => t2.is_done).length}/${tasks.length} completed`}
                  </p>
                  <p className="text-xs text-on-surface-variant m-0">
                    {Math.round((tasks.filter(t2 => t2.is_done).length / tasks.length) * 100)}%
                  </p>
                </div>
                <div className="w-full h-2 bg-surface-container-low rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(tasks.filter(t2 => t2.is_done).length / tasks.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
            {tasks.length === 0 && (
              <p className="text-sm text-on-surface-variant mb-3">
                {lang === 'ar' ? 'لا توجد مهام بعد. أضف مهمة أدناه.' : 'No tasks yet. Add one below.'}
              </p>
            )}
            {tasks.map(task => (
              <div key={task.id} className="bg-surface-container-low rounded-xl px-4 py-3 mb-2 flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={task.is_done}
                  onChange={() => toggleTask(task)}
                  className="w-4 h-4 rounded border border-outline-variant text-primary cursor-pointer mt-0.5"
                />
                <div className="flex-1">
                  <p className={`text-sm m-0 ${task.is_done ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                    {lang === 'ar' && task.title_ar ? task.title_ar : task.title}
                  </p>
                  {task.is_done && task.done_at && (
                    <p className="text-[11px] text-on-surface-variant mt-0.5 m-0">
                      {task.done_by_user?.full_name ?? '—'} · {format(new Date(task.done_at), 'dd MMM yyyy, HH:mm')}
                    </p>
                  )}
                </div>
                {currentUser && (currentUser.id === wo.created_by || ['admin', 'manager'].includes(currentUser.role)) && (
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="text-error text-xs border-none bg-transparent cursor-pointer hover:underline"
                    aria-label={lang === 'ar' ? 'حذف المهمة' : 'Delete task'}
                  >
                    {lang === 'ar' ? 'حذف' : 'Delete'}
                  </button>
                )}
              </div>
            ))}
            <form onSubmit={addTask} className="flex gap-2 mt-3">
              <input
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                placeholder={lang === 'ar' ? 'إضافة مهمة...' : 'Add a task...'}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40 flex-1"
              />
              <button
                type="submit"
                disabled={addingTask || !newTaskTitle.trim()}
                className={`bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors ${!newTaskTitle.trim() ? 'opacity-50' : ''}`}
              >
                {addingTask ? '...' : lang === 'ar' ? 'إضافة' : 'Add'}
              </button>
            </form>
          </div>
        )}

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

        {activeTab === 'files' && wo && (
          <WorkOrderFilesTab woId={String(id)} orgId={wo.organisation_id} />
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

        {activeTab === 'labor' && (
          <div>
            <p className="text-sm text-on-surface-variant mb-4">
              {lang === 'ar'
                ? 'سجّل وقت العمل. يتم تثبيت الأجر بالساعة من ملف الفني عند التسجيل.'
                : 'Log labor time. The hourly rate is snapshotted from the technician profile at logging time.'}
            </p>
            {!['closed'].includes(wo.status) && (
              <form onSubmit={addTimeLog} className="flex gap-2.5 items-end flex-wrap mb-6">
                <div className="min-w-[120px]">
                  <label className="block text-xs text-on-surface-variant mb-1">{lang === 'ar' ? 'الدقائق' : 'Minutes'}</label>
                  <input type="number" value={logMinutes} onChange={e => setLogMinutes(e.target.value)} min="1" step="1" placeholder="0" className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40" />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs text-on-surface-variant mb-1">{lang === 'ar' ? 'ملاحظة (اختياري)' : 'Note (optional)'}</label>
                  <input value={logNote} onChange={e => setLogNote(e.target.value)} placeholder={lang === 'ar' ? 'ما الذي تم إنجازه؟' : 'What was worked on?'} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40" />
                </div>
                <button type="submit" disabled={addingTimeLog || !logMinutes} className={`bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors ${!logMinutes ? 'opacity-50' : ''}`}>
                  {addingTimeLog ? '...' : (lang === 'ar' ? 'تسجيل الوقت' : 'Log Time')}
                </button>
              </form>
            )}
            {timeLogs.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{lang === 'ar' ? 'لم يُسجّل أي وقت بعد.' : 'No labor logged yet.'}</p>
            ) : (
              timeLogs.map(t => {
                const line = t.hourly_rate ? (t.minutes / 60) * Number(t.hourly_rate) : null
                return (
                  <div key={t.id} className="bg-surface-container-low rounded-xl px-4 py-3 mb-2 flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm m-0 text-on-surface">
                        {t.minutes} {lang === 'ar' ? 'دقيقة' : 'min'}
                        {t.hourly_rate ? ` · ${money(Number(t.hourly_rate))}/hr` : ''}
                        {t.note ? ` — ${t.note}` : ''}
                      </p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5 m-0">
                        {t.user?.full_name ?? '—'} · {format(new Date(t.logged_at), 'dd MMM yyyy, HH:mm')}
                      </p>
                    </div>
                    <span className="text-sm text-on-surface-variant whitespace-nowrap">{line != null ? money(line) : '—'}</span>
                  </div>
                )
              })
            )}
            <div className="mt-4 pt-3 border-t border-outline-variant flex justify-between text-sm font-semibold text-on-surface">
              <span>{lang === 'ar' ? 'إجمالي العمالة' : 'Labor subtotal'}</span>
              <span>{money(laborCost)}</span>
            </div>
          </div>
        )}

        {activeTab === 'costs' && (
          <div>
            <p className="text-sm text-on-surface-variant mb-4">
              {lang === 'ar' ? 'سجّل التكاليف الإضافية (غير العمالة والقطع).' : 'Log additional costs (beyond labor and parts).'}
            </p>
            {!['closed'].includes(wo.status) && (
              <form onSubmit={addCost} className="flex gap-2.5 items-end flex-wrap mb-6">
                <div className="flex-[2] min-w-[180px]">
                  <label className="block text-xs text-on-surface-variant mb-1">{lang === 'ar' ? 'الوصف' : 'Description'}</label>
                  <input value={costDesc} onChange={e => setCostDesc(e.target.value)} placeholder={lang === 'ar' ? 'مثال: أجرة مقاول' : 'e.g. Contractor fee'} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40" />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="block text-xs text-on-surface-variant mb-1">{lang === 'ar' ? 'الفئة (اختياري)' : 'Category (optional)'}</label>
                  <input value={costCategory} onChange={e => setCostCategory(e.target.value)} placeholder={lang === 'ar' ? 'مثال: مقاول' : 'e.g. Contractor'} className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40" />
                </div>
                <div className="min-w-[110px]">
                  <label className="block text-xs text-on-surface-variant mb-1">{lang === 'ar' ? 'المبلغ' : 'Amount'}</label>
                  <input type="number" value={costAmount} onChange={e => setCostAmount(e.target.value)} min="0" step="0.01" placeholder="0.00" className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40" />
                </div>
                <button type="submit" disabled={addingCost || !costDesc.trim() || !costAmount} className={`bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors ${!costDesc.trim() || !costAmount ? 'opacity-50' : ''}`}>
                  {addingCost ? '...' : (lang === 'ar' ? 'إضافة تكلفة' : 'Add Cost')}
                </button>
              </form>
            )}
            {costs.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{lang === 'ar' ? 'لا توجد تكاليف إضافية بعد.' : 'No additional costs yet.'}</p>
            ) : (
              costs.map(c => (
                <div key={c.id} className="bg-surface-container-low rounded-xl px-4 py-3 mb-2 flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm m-0 text-on-surface">{c.description}{c.category ? ` · ${c.category}` : ''}</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5 m-0">{format(new Date(c.created_at), 'dd MMM yyyy, HH:mm')}</p>
                  </div>
                  <span className="text-sm text-on-surface-variant whitespace-nowrap">{money(Number(c.amount))}</span>
                </div>
              ))
            )}
            {/* WO total roll-up: labor + parts + additional costs. */}
            <div className="mt-4 pt-3 border-t border-outline-variant space-y-1.5">
              <div className="flex justify-between text-sm text-on-surface-variant">
                <span>{lang === 'ar' ? 'العمالة' : 'Labor'}</span><span>{money(laborCost)}</span>
              </div>
              <div className="flex justify-between text-sm text-on-surface-variant">
                <span>{lang === 'ar' ? 'القطع' : 'Parts'}</span><span>{money(partsCost)}</span>
              </div>
              <div className="flex justify-between text-sm text-on-surface-variant">
                <span>{lang === 'ar' ? 'تكاليف إضافية' : 'Additional costs'}</span><span>{money(additionalCost)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-on-surface pt-1.5 border-t border-outline-variant/60">
                <span>{lang === 'ar' ? 'إجمالي أمر العمل' : 'Work order total'}</span><span>{money(woTotal)}</span>
              </div>
            </div>
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

        {activeTab === 'warranty' && showWarranty && (
          <WarrantyClaimsTab
            woId={String(id)}
            orgId={wo.organisation_id}
            assetId={wo.asset_id ?? null}
            canManage={isWarrantyManager}
          />
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
