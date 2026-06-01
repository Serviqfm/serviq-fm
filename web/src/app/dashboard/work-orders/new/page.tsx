'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { sendPushNotification } from '@/lib/push'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

export default function NewWorkOrderPage() {
  const router = useRouter()
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: '',
    site_id: '',
    asset_id: '',
    assigned_to: '',
    due_at: '',
    sla_hours: '',
    is_recurring: 'false',
    recurrence_frequency: 'monthly',
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFormData() }, [])

  async function loadFormData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id
    const [{ data: assetData }, { data: siteData }, { data: techData }, { data: vendorData }] = await Promise.all([
      supabase.from('assets').select('id, name').eq('organisation_id', orgId).eq('status', 'active'),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
      supabase.from('vendors').select('id, company_name').eq('organisation_id', orgId).eq('is_active', true),
    ])
    if (assetData) setAssets(assetData)
    if (siteData) setSites(siteData)
    if (techData) setTechnicians(techData)
    if (vendorData) setVendors(vendorData)
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
    setForm(prev => ({ ...prev, [name]: value }))
    if (name === 'asset_id') checkDuplicate(value, form.title)
    if (name === 'title') checkDuplicate(form.asset_id, value)
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
    if (form.assigned_to && newWO) {
        sendPushNotification({
          user_id: form.assigned_to,
          title: 'New Work Order Assigned',
          body: `You have been assigned: ${form.title}`,
          data: { type: 'work_order', id: newWO.id },
        }).catch(console.error)

        const { data: techUser } = await supabase
          .from('users')
          .select('email')
          .eq('id', form.assigned_to)
          .single()
        if (techUser?.email) {
          const woNumber = newWO.wo_number
            ? `WO-${String(newWO.wo_number).padStart(4, '0')}`
            : newWO.id.slice(0, 8)
          fetch('/api/notifications/wo-assigned', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: form.assigned_to,
              userEmail: techUser.email,
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
                    <option value="HVAC">{t('cat.hvac')}</option>
                    <option value="Electrical">{t('cat.electrical')}</option>
                    <option value="Plumbing">{t('cat.plumbing')}</option>
                    <option value="Elevator / Lift">Elevator / Lift</option>
                    <option value="Fire Safety">{t('cat.fire')}</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Kitchen Equipment">Kitchen Equipment</option>
                    <option value="Pool / Gym">Pool / Gym</option>
                    <option value="IT Equipment">IT Equipment</option>
                    <option value="Signage">Signage</option>
                    <option value="Vehicle">Vehicle</option>
                    <option value="Other">{t('cat.other')}</option>
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
