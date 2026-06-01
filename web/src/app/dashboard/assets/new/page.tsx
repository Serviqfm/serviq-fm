'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'

export default function NewAssetPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const supabase = createClient()
  const { isHidden, isRequired, loading: configLoading } = useFieldConfig('assets_new')
  const isReq = (key: string) => isRequired(key) || isSystemRequired('assets_new', key)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    name: '',
    category: '',
    site_id: '',
    sub_location: '',
    serial_number: '',
    manufacturer: '',
    model: '',
    purchase_date: '',
    purchase_cost: '',
    warranty_expiry: '',
    expected_lifespan_years: '',
    description: '',
    location_notes: '',
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSites() }, [])

  async function loadSites() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('sites').select('id, name').eq('organisation_id', profile.organisation_id).eq('is_active', true)
    if (data) setSites(data)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const toAdd = files.slice(0, 10 - photos.length)
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
      const params = new URLSearchParams({ bucket: 'work-order-media', prefix: orgId + '/assets' })
      const res = await fetch('/api/upload?' + params.toString(), { method: 'POST', body: fd })
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

    const res = await fetch('/api/assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        category: form.category,
        site_id: form.site_id,
        sub_location: form.sub_location,
        serial_number: form.serial_number,
        manufacturer: form.manufacturer,
        model: form.model,
        purchase_date: form.purchase_date,
        purchase_cost: form.purchase_cost,
        warranty_expiry: form.warranty_expiry,
        expected_lifespan_years: form.expected_lifespan_years,
        description: form.description,
        location_notes: form.location_notes,
        photo_urls: photoUrls,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.error ?? 'Failed to create asset')
      setLoading(false)
      return
    }
    router.push('/dashboard/assets')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (configLoading) return <div style={{ padding: '2rem' }}>{lang === 'ar' ? 'جارٍ التحميل...' : 'Loading form…'}</div>

  const reqMark = (key: string) => isReq(key) ? <span style={{ color: '#d32f2f' }}> *</span> : null

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/assets' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع للأصول' : 'Back to Assets'}</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>{lang === 'ar' ? 'إضافة أصل جديد' : 'Add New Asset'}</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {!isHidden('name') && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'اسم الأصل' : 'Asset Name'}{reqMark('name')}</label>
            <input name='name' value={form.name} onChange={handleChange} required={isReq('name')} placeholder='e.g. Carrier AC Unit - Room 204' style={fieldStyle} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('category') && (
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'الفئة' : 'Category'}{reqMark('category')}</label>
              <select name='category' value={form.category} onChange={handleChange} required={isReq('category')} style={fieldStyle}>
                <option value=''>{lang === 'ar' ? 'اختر الفئة' : 'Select category'}</option>
                <option value='HVAC'>HVAC</option>
                <option value='Electrical'>Electrical</option>
                <option value='Plumbing'>Plumbing</option>
                <option value='Elevator / Lift'>Elevator / Lift</option>
                <option value='Fire Safety'>Fire Safety</option>
                <option value='Furniture'>Furniture</option>
                <option value='Kitchen Equipment'>Kitchen Equipment</option>
                <option value='Pool / Gym'>Pool / Gym</option>
                <option value='IT Equipment'>IT Equipment</option>
                <option value='Signage'>Signage</option>
                <option value='Vehicle'>Vehicle</option>
                <option value='Other'>Other</option>
              </select>
            </div>
          )}
          {!isHidden('site_id') && (
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'الموقع' : 'Site'}{reqMark('site_id')}</label>
              <select name='site_id' value={form.site_id} onChange={handleChange} required={isReq('site_id')} style={fieldStyle}>
                <option value=''>{lang === 'ar' ? 'اختر الموقع' : 'Select site'}</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('sub_location') && (
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'الموقع الفرعي' : 'Sub-location'}{reqMark('sub_location')}</label>
              <input name='sub_location' value={form.sub_location} onChange={handleChange} required={isReq('sub_location')} placeholder='e.g. Floor 2, Room 204' style={fieldStyle} />
            </div>
          )}
          {!isHidden('location_notes') && (
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'ملاحظات الموقع' : 'Location Notes'}{reqMark('location_notes')}</label>
              <input name='location_notes' value={form.location_notes} onChange={handleChange} required={isReq('location_notes')} placeholder='e.g. Near east stairwell' style={fieldStyle} />
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('manufacturer') && (
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'الشركة المصنعة' : 'Manufacturer'}{reqMark('manufacturer')}</label>
              <input name='manufacturer' value={form.manufacturer} onChange={handleChange} required={isReq('manufacturer')} placeholder='e.g. Carrier' style={fieldStyle} />
            </div>
          )}
          {!isHidden('model') && (
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'الموديل' : 'Model'}{reqMark('model')}</label>
              <input name='model' value={form.model} onChange={handleChange} required={isReq('model')} placeholder='e.g. 42QHC018DS' style={fieldStyle} />
            </div>
          )}
        </div>
        {!isHidden('serial_number') && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'الرقم التسلسلي' : 'Serial Number'}{reqMark('serial_number')}</label>
            <input name='serial_number' value={form.serial_number} onChange={handleChange} required={isReq('serial_number')} placeholder='e.g. SN-2024-00123' style={fieldStyle} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('purchase_date') && (
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'تاريخ الشراء' : 'Purchase Date'}{reqMark('purchase_date')}</label>
              <input name='purchase_date' type='date' value={form.purchase_date} onChange={handleChange} required={isReq('purchase_date')} style={fieldStyle} />
            </div>
          )}
          {!isHidden('purchase_cost') && (
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'تكلفة الشراء (ريال)' : 'Purchase Cost (SAR)'}{reqMark('purchase_cost')}</label>
              <input name='purchase_cost' type='number' value={form.purchase_cost} onChange={handleChange} required={isReq('purchase_cost')} placeholder='e.g. 12500' style={fieldStyle} />
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('warranty_expiry') && (
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'انتهاء الضمان' : 'Warranty Expiry'}{reqMark('warranty_expiry')}</label>
              <input name='warranty_expiry' type='date' value={form.warranty_expiry} onChange={handleChange} required={isReq('warranty_expiry')} style={fieldStyle} />
            </div>
          )}
          {!isHidden('expected_lifespan_years') && (
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'العمر الافتراضي (سنوات)' : 'Expected Lifespan (years)'}{reqMark('expected_lifespan_years')}</label>
              <input name='expected_lifespan_years' type='number' value={form.expected_lifespan_years} onChange={handleChange} required={isReq('expected_lifespan_years')} placeholder='e.g. 10' style={fieldStyle} />
            </div>
          )}
        </div>
        {!isHidden('description') && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'الوصف' : 'Description'}{reqMark('description')}</label>
            <textarea name='description' value={form.description} onChange={handleChange} rows={3} required={isReq('description')} placeholder='Additional notes...' style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>
        )}
        {!isHidden('photos') && (
          <div>
            <label style={labelStyle}>
              Photos (up to 10){reqMark('photos')}
              <span style={{ fontWeight: 400, color: '#999', marginLeft: 8, fontSize: 12 }}>6-month media retention</span>
            </label>
            <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed #ddd', borderRadius: 8, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', color: '#999', fontSize: 13 }}>
              {photos.length < 10 ? 'Click to add photos (' + photos.length + '/10)' : 'Maximum 10 photos reached'}
            </div>
            <input ref={fileInputRef} type='file' accept='image/*' multiple onChange={handlePhotoChange} style={{ display: 'none' }} />
            {photoPreviewUrls.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {photoPreviewUrls.map((url, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt='' style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                    <button type='button' onClick={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c62828', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12 }}>x</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1565c0' }}>
          A unique QR code will be automatically generated for this asset when saved.
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </div>
  )
}
