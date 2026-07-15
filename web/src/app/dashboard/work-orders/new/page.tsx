'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { sendPushNotification } from '@/lib/push'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'
import WorkOrderCustomFields from '@/components/WorkOrderCustomFields'
import { fetchWoCategories, catLabel, type WoCategory } from '@/lib/woCategories'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseTasks(tasks: any): { title: string; title_ar: string }[] {
  return Array.isArray(tasks)
    ? tasks.map((it: { title?: string; title_ar?: string }) => ({ title: it.title ?? '', title_ar: it.title_ar ?? '' }))
    : []
}

export default function NewWorkOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefilledAssetId = searchParams.get('asset_id') ?? ''
  const prefilledSiteId = searchParams.get('site_id') ?? ''
  const { t, lang } = useLanguage()
  const supabase = createClient()
  const { isHidden, isRequired, loading: configLoading } = useFieldConfig('work_orders_new')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isReq = (key: string) => isRequired(key) || isSystemRequired('work_orders_new', key)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assets, setAssets] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [technicians, setTechnicians] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
  const [vendors, setVendors] = useState<any[]>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([])
  const [duplicateWarning, setDuplicateWarning] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [templates, setTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [teams, setTeams] = useState<any[]>([])
  const [additionalWorkers, setAdditionalWorkers] = useState<string[]>([])
  const [isManager, setIsManager] = useState(false)
  const [taskRows, setTaskRows] = useState<{ title: string; title_ar: string }[]>([])
  const [customFields, setCustomFields] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<WoCategory[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: '',
    site_id: prefilledSiteId,
    asset_id: prefilledAssetId,
    assigned_to: '',
    team_id: '',
    due_at: '',
    start_at: '',
    sla_hours: '',
    is_recurring: 'false',
    recurrence_frequency: 'monthly',
    estimated_duration: '',
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFormData() }, [])

  // Belt-and-braces: useSearchParams can return null on the first client render
  // before hydration, in which case the useState initializer above misses the
  // ?asset_id= / ?site_id= query and the dropdowns render unselected. Watch the
  // params and patch the form once they're available.
  useEffect(() => {
    const a = searchParams.get('asset_id')
    const s = searchParams.get('site_id')
    if (a || s) {
      setForm(prev => ({
        ...prev,
        asset_id: a ?? prev.asset_id,
        site_id: s ?? prev.site_id,
      }))
    }
  }, [searchParams])

  async function loadFormData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id
    setIsManager(profile.role === 'admin' || profile.role === 'manager')
    const [{ data: assetData }, { data: siteData }, { data: techData }, { data: vendorData }, { data: templateData }, { data: teamData }] = await Promise.all([
      supabase.from('assets').select('id, name, site_id').eq('organisation_id', orgId).eq('status', 'active'),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
      supabase.from('vendors').select('id, company_name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('checklist_templates').select('id, name, name_ar, items').eq('organisation_id', orgId).order('name'),
      supabase.from('teams').select('id, name, name_ar').eq('organisation_id', orgId).order('name'),
    ])
    setCategories(await fetchWoCategories(supabase))
    if (assetData) setAssets(assetData)
    if (siteData) setSites(siteData)
    if (techData) setTechnicians(techData)
    if (vendorData) setVendors(vendorData)
    if (templateData) setTemplates(templateData)
    if (teamData) setTeams(teamData)

    // WO-08: prefill from a work-order template (?template=). WO-09: prefill from an
    // existing WO (?duplicate_from=). Both seed the form + tasks; the existing 3-write
    // submit flow then recreates everything as a brand-new WO.
    const templateId = searchParams.get('template')
    const duplicateFrom = searchParams.get('duplicate_from')
    if (templateId) {
      const { data: tpl } = await supabase.from('work_order_templates').select('*').eq('id', templateId).maybeSingle()
      if (tpl) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const asset = (assetData ?? []).find((a: any) => a.id === tpl.asset_id)
        setForm(prev => ({
          ...prev,
          title: tpl.title ?? '',
          description: tpl.description ?? '',
          priority: tpl.priority ?? prev.priority,
          category: tpl.category ?? '',
          asset_id: tpl.asset_id ?? '',
          site_id: asset?.site_id ?? prev.site_id,
          assigned_to: tpl.assigned_to ?? '',
          estimated_duration: tpl.estimated_duration_minutes ? String(tpl.estimated_duration_minutes) : '',
        }))
        setTaskRows(normaliseTasks(tpl.tasks))
      }
    } else if (duplicateFrom) {
      const [{ data: src }, { data: srcTasks }] = await Promise.all([
        supabase.from('work_orders').select('*').eq('id', duplicateFrom).maybeSingle(),
        supabase.from('work_order_tasks').select('title, title_ar, sort_order').eq('work_order_id', duplicateFrom).order('sort_order'),
      ])
      if (src) {
        // Copy definitional fields only — never wo_number/status/dates/photos (per-instance).
        setForm(prev => ({
          ...prev,
          title: src.title ?? '',
          description: src.description ?? '',
          priority: src.priority ?? prev.priority,
          category: src.category ?? '',
          site_id: src.site_id ?? '',
          asset_id: src.asset_id ?? '',
          assigned_to: src.assigned_to ?? '',
          team_id: src.team_id ?? '',
          sla_hours: src.sla_hours ? String(src.sla_hours) : '',
          estimated_duration: src.estimated_duration_minutes ? String(src.estimated_duration_minutes) : '',
        }))
        if (Array.isArray(src.additional_workers)) setAdditionalWorkers(src.additional_workers)
        setTaskRows(normaliseTasks(srcTasks))
      }
    }
  }

  async function checkDuplicate(assetId: string, title: string) {
    if (!assetId || !title) return
    const { data } = await supabase.from('work_orders').select('id').eq('asset_id', assetId).not('status', 'in', '("completed","closed")')
    if (data && data.length > 0) {
      setDuplicateWarning(`Warning: ${data.length} open work order(s) already exist for this asset.`)
    } else {
      setDuplicateWarning('')
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm(prev => {
      const next = { ...prev, [name]: value }
      // UpKeep parity: selecting an asset auto-fills its site/location
      if (name === 'asset_id') {
        const asset = assets.find(a => a.id === value)
        if (asset?.site_id) next.site_id = asset.site_id
      }
      return next
    })
    if (name === 'asset_id') checkDuplicate(value, form.title)
    if (name === 'title') checkDuplicate(form.asset_id, value)
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId)
    if (!templateId) return
    const tpl = templates.find(tp => tp.id === templateId)
    if (!tpl || !Array.isArray(tpl.items)) return
    setTaskRows(tpl.items.map((it: { title?: string; title_ar?: string }) => ({
      title: it.title ?? '',
      title_ar: it.title_ar ?? '',
    })))
  }

  function updateTaskRow(index: number, value: string) {
    setTaskRows(prev => prev.map((row, i) => {
      if (i !== index) return row
      // In Arabic mode, rows that came from a bilingual template edit the Arabic
      // title (that's the one displayed); everything else edits the EN title.
      if (lang === 'ar' && row.title_ar) return { ...row, title_ar: value }
      return { ...row, title: value }
    }))
  }

  function removeTaskRow(index: number) {
    setTaskRows(prev => prev.filter((_, i) => i !== index))
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const toAdd = files.slice(0, 8 - photos.length)
    setPhotos(prev => [...prev, ...toAdd])
    setPhotoPreviewUrls(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index))
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  async function uploadPhotos(orgId: string): Promise<string[]> {
    const urls: string[] = []
    for (const file of photos) {
      const fd = new FormData()
      fd.append('file', file)
      const params = new URLSearchParams({ bucket: 'work-order-media', prefix: orgId })
      const res = await fetch(`/api/upload?${params.toString()}`, { method: 'POST', body: fd })
      if (res.ok) {
        const { publicUrl } = await res.json()
        urls.push(publicUrl)
      }
    }
    return urls
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in'); setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setError('User profile not found'); setLoading(false); return }
    let photoUrls: string[] = []
    if (photos.length > 0) photoUrls = await uploadPhotos(profile.organisation_id)

    const res = await fetch('/api/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        priority: form.priority,
        category: form.category,
        site_id: form.site_id,
        asset_id: form.asset_id,
        assigned_to: form.assigned_to,
        due_at: form.due_at,
        sla_hours: form.sla_hours,
        is_recurring: form.is_recurring === 'true',
        recurrence_frequency: form.recurrence_frequency,
        photo_urls: photoUrls,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.error ?? 'Failed to create work order')
      setLoading(false)
      return
    }
    const newWO = data.work_order

    if (newWO) {
      // Estimated duration, team and additional workers are not part of the
      // field-config catalog / POST whitelist — save them client-side after
      // the insert (org-scoped RLS update).
      const extras: Record<string, unknown> = {}
      const estMin = parseInt(form.estimated_duration)
      if (!isNaN(estMin) && estMin > 0) extras.estimated_duration_minutes = estMin
      // WO-31: planned start date (distinct from actual started_at).
      if (form.start_at) extras.start_at = form.start_at
      // WO-26: custom-field values, keyed by definition.key (blanks dropped).
      const cfEntries = Object.entries(customFields).filter(([, v]) => v !== '')
      if (cfEntries.length > 0) extras.custom_fields = Object.fromEntries(cfEntries)
      // CORE-20: team / additional-worker assignment is manager-only. Non-managers
      // never see these fields and never write them (the DB trigger also blocks
      // non-manager worker-list changes as the durable backstop).
      if (isManager) {
        if (form.team_id) extras.team_id = form.team_id
        const workerIds = additionalWorkers.filter(uid => uid !== form.assigned_to)
        if (workerIds.length > 0) extras.additional_workers = workerIds
      }
      if (Object.keys(extras).length > 0) {
        await supabase.from('work_orders').update(extras).eq('id', newWO.id)
      }

      // Insert checklist tasks after the WO insert succeeds
      const validTasks = taskRows.filter(r => r.title.trim() || r.title_ar.trim())
      if (validTasks.length > 0) {
        const { error: taskErr } = await supabase.from('work_order_tasks').insert(
          validTasks.map((r, i) => ({
            organisation_id: newWO.organisation_id,
            work_order_id: newWO.id,
            title: r.title.trim() || r.title_ar.trim(),
            title_ar: r.title_ar.trim() ? r.title_ar.trim() : null,
            sort_order: i,
          }))
        )
        if (taskErr) {
          console.error('[work-orders new] task insert failed', taskErr)
          alert(lang === 'ar'
            ? 'تم إنشاء أمر العمل، لكن فشلت إضافة المهام. يمكنك إضافتها من صفحة أمر العمل.'
            : 'Work order created, but adding its tasks failed. You can add them from the work order page.')
        }
      }
    }

    if (newWO) {
        if (form.assigned_to) {
          sendPushNotification({
            user_id: form.assigned_to,
            title: 'New Work Order Assigned',
            body: `You have been assigned: ${form.title}`,
            data: { type: 'work_order', id: newWO.id },
          }).catch(console.error)
        }

        // 1C-06/WO-28: notify assignee + team members + additional workers. The route
        // resolves recipients server-side (org-scoped, active-only). On create every
        // recipient is new, so no delta is needed.
        const newTeamId = isManager && form.team_id ? form.team_id : undefined
        const newWorkerIds = isManager
          ? additionalWorkers.filter(uid => uid !== form.assigned_to)
          : []
        if (form.assigned_to || newTeamId || newWorkerIds.length > 0) {
          const woNumber = newWO.wo_number
            ? `WO-${String(newWO.wo_number).padStart(4, '0')}`
            : newWO.id.slice(0, 8)
          fetch('/api/notifications/wo-assigned', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: form.assigned_to || undefined,
              teamId: newTeamId,
              additionalWorkerIds: newWorkerIds,
              assignedBy: 'Manager',
              woNumber,
              woTitle: form.title,
              woId: newWO.id,
            }),
          }).catch(console.error)
        }
    }
    router.push('/dashboard/work-orders')
  }

  const mediaExpiryDate = new Date()
  mediaExpiryDate.setMonth(mediaExpiryDate.getMonth() + 6)

  if (configLoading) return <div className="p-8 text-on-surface-variant">Loading form…</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[680px] mx-auto space-y-6">
        <div>
          <a href="/dashboard/work-orders" className="text-on-surface-variant text-sm hover:text-primary transition-colors">{t('common.back')}</a>
          <h1 className="text-2xl font-bold text-on-surface mt-2">{t('wo.new')}</h1>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isHidden('title') && (
              <div>
                <label className={labelCls}>
                  {lang === 'ar' ? 'العنوان' : 'Title'}
                  {isReq('title') && <span className="text-error"> *</span>}
                </label>
                <input name="title" value={form.title} onChange={handleChange}
                  required={isReq('title')}
                  placeholder="e.g. AC unit not cooling - Room 204" className={inputCls} />
              </div>
            )}

            {!isHidden('description') && (
              <div>
                <label className={labelCls}>
                  {lang === 'ar' ? 'الوصف' : 'Description'}
                  {isReq('description') && <span className="text-error"> *</span>}
                </label>
                <textarea name="description" value={form.description} onChange={handleChange} rows={3}
                  required={isReq('description')}
                  placeholder="Describe the issue in detail..." className={inputCls + ' resize-vertical'} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {!isHidden('priority') && (
                <div>
                  <label className={labelCls}>
                    {lang === 'ar' ? 'الأولوية' : 'Priority'}
                    {isReq('priority') && <span className="text-error"> *</span>}
                  </label>
                  <select name="priority" value={form.priority} onChange={handleChange}
                    required={isReq('priority')}
                    className={inputCls}>
                    <option value="low">{t('wo.priority.low')}</option>
                    <option value="medium">{t('wo.priority.medium')}</option>
                    <option value="high">{t('wo.priority.high')}</option>
                    <option value="critical">{t('wo.priority.critical')}</option>
                  </select>
                </div>
              )}
              {!isHidden('category') && (
                <div>
                  <label className={labelCls}>
                    {lang === 'ar' ? 'الفئة' : 'Category'}
                    {isReq('category') && <span className="text-error"> *</span>}
                  </label>
                  <select name="category" value={form.category} onChange={handleChange}
                    required={isReq('category')}
                    className={inputCls}>
                    <option value="">{lang === 'ar' ? 'اختر الفئة' : 'Select category'}</option>
                    {categories.map(c => (
                      <option key={c.name} value={c.name}>{catLabel(c, lang)}</option>
                    ))}
                    {form.category && !categories.some(c => c.name === form.category) && (
                      <option value={form.category}>{form.category}</option>
                    )}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!isHidden('site_id') && (
                <div>
                  <label className={labelCls}>
                    {lang === 'ar' ? 'الموقع' : 'Site / Location'}
                    {isReq('site_id') && <span className="text-error"> *</span>}
                  </label>
                  <select name="site_id" value={form.site_id} onChange={handleChange}
                    required={isReq('site_id')}
                    className={inputCls}>
                    <option value="">{lang === 'ar' ? 'اختر الموقع' : 'Select site'}</option>
                    {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {sites.length === 0 && <p className="text-xs text-on-surface-variant mt-1">No sites added yet</p>}
                </div>
              )}
              {!isHidden('asset_id') && (
                <div>
                  <label className={labelCls}>
                    {lang === 'ar' ? 'الأصل' : 'Asset'}
                    {isReq('asset_id') && <span className="text-error"> *</span>}
                  </label>
                  <select name="asset_id" value={form.asset_id} onChange={handleChange}
                    required={isReq('asset_id')}
                    className={inputCls}>
                    <option value="">{lang === 'ar' ? 'اختر الأصل' : 'Select asset'}</option>
                    {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  {assets.length === 0 && <p className="text-xs text-on-surface-variant mt-1">No assets added yet</p>}
                </div>
              )}
            </div>

            {duplicateWarning && (
              <div className="bg-[#f57f17]/10 border border-[#f57f17]/30 rounded-xl px-4 py-3 text-sm text-[#f57f17]">
                {duplicateWarning}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {!isHidden('assigned_to') && (
                <div>
                  <label className={labelCls}>
                    {lang === 'ar' ? 'تعيين إلى' : 'Assign To'}
                    {isReq('assigned_to') && <span className="text-error"> *</span>}
                  </label>
                  <select name="assigned_to" value={form.assigned_to} onChange={handleChange}
                    required={isReq('assigned_to')}
                    className={inputCls}>
                    <option value="">{t('common.unassigned')}</option>
                    {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
                  </select>
                </div>
              )}
              {!isHidden('sla_hours') && (
                <div>
                  <label className={labelCls}>
                    {lang === 'ar' ? 'ساعات الخدمة' : 'SLA (hours to resolve)'}
                    {isReq('sla_hours') && <span className="text-error"> *</span>}
                  </label>
                  <input name="sla_hours" type="number" value={form.sla_hours} onChange={handleChange}
                    required={isReq('sla_hours')}
                    placeholder="e.g. 24" min="1" className={inputCls} />
                </div>
              )}
            </div>

            {isManager && teams.length > 0 && (
              <div>
                <label className={labelCls}>
                  {lang === 'ar' ? 'الفريق' : 'Team'}
                  <span className="font-normal text-on-surface-variant ml-2 normal-case tracking-normal">
                    {lang === 'ar' ? '(اختياري)' : '(optional)'}
                  </span>
                </label>
                <select name="team_id" value={form.team_id} onChange={handleChange} className={inputCls}>
                  <option value="">{lang === 'ar' ? 'بدون فريق' : 'No team'}</option>
                  {teams.map(tm => (
                    <option key={tm.id} value={tm.id}>{lang === 'ar' && tm.name_ar ? tm.name_ar : tm.name}</option>
                  ))}
                </select>
              </div>
            )}

            {isManager && technicians.filter(tech => tech.id !== form.assigned_to).length > 0 && (
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4">
                <label className={labelCls}>
                  {lang === 'ar' ? 'عمال إضافيون' : 'Additional Workers'}
                  <span className="font-normal text-on-surface-variant ml-2 normal-case tracking-normal">
                    ({additionalWorkers.filter(uid => uid !== form.assigned_to).length} {lang === 'ar' ? 'محدد' : 'selected'})
                  </span>
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {technicians.filter(tech => tech.id !== form.assigned_to).map(tech => (
                    <label key={tech.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-container cursor-pointer">
                      <input
                        type="checkbox"
                        checked={additionalWorkers.includes(tech.id)}
                        onChange={() => setAdditionalWorkers(prev => prev.includes(tech.id) ? prev.filter(uid => uid !== tech.id) : [...prev, tech.id])}
                        className="w-4 h-4 rounded border border-outline-variant text-primary cursor-pointer"
                      />
                      <span className="text-sm text-on-surface">{tech.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!isHidden('due_at') && (
              <div>
                <label className={labelCls}>
                  {lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}
                  {isReq('due_at') && <span className="text-error"> *</span>}
                </label>
                <input name="due_at" type="datetime-local" value={form.due_at} onChange={handleChange}
                  required={isReq('due_at')}
                  className={inputCls} />
              </div>
            )}

            <div>
              <label className={labelCls}>
                {lang === 'ar' ? 'تاريخ البدء المخطط' : 'Planned Start Date'}
              </label>
              <input name="start_at" type="datetime-local" value={form.start_at} onChange={handleChange}
                className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>
                {lang === 'ar' ? 'المدة المقدرة (بالدقائق)' : 'Estimated Duration (minutes)'}
              </label>
              <input name="estimated_duration" type="number" value={form.estimated_duration} onChange={handleChange}
                placeholder={lang === 'ar' ? 'مثال: 90' : 'e.g. 90'} min="1" className={inputCls} />
            </div>

            <WorkOrderCustomFields values={customFields} onChange={setCustomFields} />

            <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <label className={labelCls + ' mb-0'}>
                  {lang === 'ar' ? 'المهام' : 'Tasks'}
                  <span className="font-normal text-on-surface-variant ml-2 normal-case tracking-normal">
                    {lang === 'ar' ? '(اختياري)' : '(optional)'}
                  </span>
                </label>
                {templates.length > 0 && (
                  <select value={selectedTemplateId} onChange={e => applyTemplate(e.target.value)}
                    className="bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer">
                    <option value="">{lang === 'ar' ? 'تطبيق قالب قائمة مهام...' : 'Apply checklist template...'}</option>
                    {templates.map(tp => (
                      <option key={tp.id} value={tp.id}>{lang === 'ar' && tp.name_ar ? tp.name_ar : tp.name}</option>
                    ))}
                  </select>
                )}
              </div>
              {taskRows.length === 0 && (
                <p className="text-xs text-on-surface-variant mb-2">
                  {lang === 'ar' ? 'أضف مهام يجب إنجازها ضمن أمر العمل هذا.' : 'Add tasks to be checked off as part of this work order.'}
                </p>
              )}
              {taskRows.map((row, i) => (
                <div key={i} className="flex gap-2 mb-2 items-center">
                  <span className="text-xs text-on-surface-variant w-5 text-center">{i + 1}.</span>
                  <input
                    value={lang === 'ar' && row.title_ar ? row.title_ar : row.title}
                    onChange={e => updateTaskRow(i, e.target.value)}
                    placeholder={lang === 'ar' ? 'وصف المهمة...' : 'Task description...'}
                    className={inputCls + ' flex-1'}
                  />
                  <button type="button" onClick={() => removeTaskRow(i)}
                    className="w-7 h-7 rounded-full bg-error/10 text-error border-none cursor-pointer text-sm flex items-center justify-center flex-shrink-0 hover:bg-error/20 transition-colors"
                    aria-label={lang === 'ar' ? 'إزالة المهمة' : 'Remove task'}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setTaskRows(prev => [...prev, { title: '', title_ar: '' }])}
                className="text-primary text-sm font-semibold bg-transparent border-none cursor-pointer hover:underline px-0">
                {lang === 'ar' ? '+ إضافة مهمة' : '+ Add task'}
              </button>
            </div>

            {!isHidden('is_recurring') && (
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="checkbox"
                    id="is_recurring"
                    checked={form.is_recurring === 'true'}
                    onChange={e => setForm(prev => ({ ...prev, is_recurring: e.target.checked ? 'true' : 'false' }))}
                    className="w-4 h-4 rounded border border-outline-variant text-primary cursor-pointer"
                  />
                  <label htmlFor="is_recurring" className="text-sm font-medium text-on-surface cursor-pointer">
                    Recurring work order
                    {isReq('is_recurring') && <span className="text-error"> *</span>}
                  </label>
                </div>
                {form.is_recurring === 'true' && !isHidden('recurrence_frequency') && (
                  <div>
                    <p className="text-xs text-on-surface-variant mb-2">This work order will be linked to a PM schedule. Select the recurrence frequency:</p>
                    <select name="recurrence_frequency" value={form.recurrence_frequency} onChange={handleChange}
                      required={isReq('recurrence_frequency')}
                      className={inputCls}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="biannual">Every 6 Months</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {!isHidden('photos') && (
              <div>
                <label className={labelCls}>
                  Photos (up to 8)
                  {isReq('photos') && <span className="text-error"> *</span>}
                  <span className="font-normal text-on-surface-variant ml-2 normal-case">
                    Stored for 6 months until {mediaExpiryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-outline-variant rounded-xl p-6 text-center cursor-pointer text-on-surface-variant text-sm hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  {photos.length < 8 ? `Click to add photos (${photos.length}/8)` : 'Maximum 8 photos reached'}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoChange} className="hidden" />
                {photoPreviewUrls.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-3">
                    {photoPreviewUrls.map((url, i) => (
                      <div key={i} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg border border-outline-variant" />
                        <button type="button" onClick={() => removePhoto(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error text-on-error border-none cursor-pointer text-xs flex items-center justify-center">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-error text-sm">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? t('common.saving') : t('wo.new')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
