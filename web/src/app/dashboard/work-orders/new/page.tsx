'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, inputStyle, labelStyle, sectionCard, primaryBtn, pageStyle } from '@/lib/brand'
import { sendPushNotification } from '@/lib/push'

export default function NewWorkOrderPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [assets, setAssets] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      const fileName = `${orgId}/${Date.now()}-${file.name}`
      const { data, error } = await supabase.storage.from('work-order-media').upload(fileName, file)
      if (!error && data) {
        const { data: urlData } = supabase.storage.from('work-order-media').getPublicUrl(data.path)
        urls.push(urlData.publicUrl)
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
    const { data: newWO, error: insertError } = await supabase.from('work_orders').insert({
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      category: form.category || null,
      site_id: form.site_id || null,
      asset_id: form.asset_id || null,
      assigned_to: form.assigned_to || null,
      due_at: form.due_at || null,
      sla_hours: form.sla_hours ? parseInt(form.sla_hours) : null,
      created_by: user.id,
      organisation_id: profile.organisation_id,
      status: form.assigned_to ? 'assigned' : 'new',
      source: form.is_recurring === 'true' ? 'recurring' : 'manual',
      photo_urls: photoUrls,
    }).select().single()
    if (insertError) { setError(insertError.message); setLoading(false) }
    else {
      if (form.assigned_to && newWO) {
        await sendPushNotification({
          user_id: form.assigned_to,
          title: 'New Work Order Assigned',
          body: `You have been assigned: ${form.title}`,
          data: { type: 'work_order', id: newWO.id },
        })
      }
      router.push('/dashboard/work-orders')
    }
  }

  const mediaExpiryDate = new Date()
  mediaExpiryDate.setMonth(mediaExpiryDate.getMonth() + 6)

  return (
    <div style={{ ...pageStyle, maxWidth: 680 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href="/dashboard/work-orders" style={{ color: C.textLight, fontSize: 13, textDecoration: 'none', fontFamily: F.en }}>{t('common.back')}</a>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0.5rem 0 0' }}>{t('wo.new')}</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input name="title" value={form.title} onChange={handleChange} required placeholder="e.g. AC unit not cooling - Room 204" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'الوصف' : 'Description'}</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} placeholder="Describe the issue in detail..." style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Priority *</label>
            <select name="priority" value={form.priority} onChange={handleChange} style={inputStyle}>
              <option value="low">{t('wo.priority.low')}</option>
              <option value="medium">{t('wo.priority.medium')}</option>
              <option value="high">{t('wo.priority.high')}</option>
              <option value="critical">{t('wo.priority.critical')}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'الفئة' : 'Category'}</label>
            <select name="category" value={form.category} onChange={handleChange} style={inputStyle}>
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
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'الموقع' : 'Site / Location'}</label>
            <select name="site_id" value={form.site_id} onChange={handleChange} style={inputStyle}>
              <option value="">{lang === 'ar' ? 'اختر الموقع' : 'Select site'}</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {sites.length === 0 && <p style={{ fontSize: 11, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>No sites added yet</p>}
          </div>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'الأصل' : 'Asset'}</label>
            <select name="asset_id" value={form.asset_id} onChange={handleChange} style={inputStyle}>
              <option value="">{lang === 'ar' ? 'اختر الأصل' : 'Select asset'}</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {assets.length === 0 && <p style={{ fontSize: 11, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>No assets added yet</p>}
          </div>
        </div>
        {duplicateWarning && (
          <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: C.warning, fontFamily: F.en }}>
            {duplicateWarning}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'تعيين إلى' : 'Assign To'}</label>
            <select name="assigned_to" value={form.assigned_to} onChange={handleChange} style={inputStyle}>
              <option value="">{t('common.unassigned')}</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'ساعات الخدمة' : 'SLA (hours to resolve)'}</label>
            <input name="sla_hours" type="number" value={form.sla_hours} onChange={handleChange} placeholder="e.g. 24" min="1" style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
          <input name="due_at" type="datetime-local" value={form.due_at} onChange={handleChange} style={inputStyle} />
        </div>
        <div style={{ ...sectionCard, padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <input
              type='checkbox'
              id='is_recurring'
              checked={form.is_recurring === 'true'}
              onChange={e => setForm(prev => ({ ...prev, is_recurring: e.target.checked ? 'true' : 'false' }))}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor='is_recurring' style={{ fontSize: 13, fontWeight: 500, color: C.textMid, fontFamily: F.en, cursor: 'pointer' }}>
              Recurring work order
            </label>
          </div>
          {form.is_recurring === 'true' && (
            <div>
              <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 8px' }}>This work order will be linked to a PM schedule. Select the recurrence frequency:</p>
              <select name='recurrence_frequency' value={form.recurrence_frequency} onChange={handleChange} style={inputStyle}>
                <option value='daily'>Daily</option>
                <option value='weekly'>Weekly</option>
                <option value='monthly'>Monthly</option>
                <option value='quarterly'>Quarterly</option>
                <option value='biannual'>Every 6 Months</option>
                <option value='annual'>Annual</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>
            Photos (up to 8)
            <span style={{ fontWeight: 400, color: C.textLight, marginLeft: 8, fontSize: 12, fontFamily: F.en }}>Stored for 6 months until {mediaExpiryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </label>
          <div onClick={() => fileInputRef.current?.click()} style={{ border: `2px dashed ${C.border}`, borderRadius: 8, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', color: C.textLight, fontSize: 13, fontFamily: F.en }}>
            {photos.length < 8 ? `Click to add photos (${photos.length}/8)` : 'Maximum 8 photos reached'}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoChange} style={{ display: 'none' }} />
          {photoPreviewUrls.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {photoPreviewUrls.map((url, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
                  <button type="button" onClick={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: C.danger, color: C.white, border: 'none', cursor: 'pointer', fontSize: 12 }}>x</button>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && <p style={{ color: C.danger, fontSize: 13, margin: 0, fontFamily: F.en }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ ...primaryBtn, padding: '11px', fontSize: 15, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? t('common.saving') : t('wo.new')}
        </button>
      </form>
    </div>
  )
}
