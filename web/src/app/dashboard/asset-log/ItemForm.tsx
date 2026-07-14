'use client'

// Shared create/edit form for Asset Log items (AG-4). Used by new/page.tsx and
// [id]/edit/page.tsx. POSTs to /api/asset-log on create, PATCHes /api/asset-log/[id]
// on edit. Photos go through /api/upload. Inline "+ new type" inserts an
// asset_log_types row via the browser client (org-scoped RLS insert).

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { ASSET_LOG_STATUSES } from '@/lib/asset-log'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

type CustomField = { key: string; value: string }

export type ItemFormProps = {
  mode: 'create' | 'edit'
  itemId?: string
  initial?: Row // existing item row when editing
}

const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }
const sectionStyle = { fontSize: 15, fontWeight: 600 as const, color: '#1a1a2e', margin: '0.5rem 0 0' }

export default function ItemForm({ mode, itemId, initial }: ItemFormProps) {
  const router = useRouter()
  const { lang, t } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string>('')
  const [types, setTypes] = useState<Row[]>([])
  const [sites, setSites] = useState<Row[]>([])
  const [spaces, setSpaces] = useState<Row[]>([])
  const [vendors, setVendors] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([])
  const [existingPhotos, setExistingPhotos] = useState<string[]>(initial?.photo_urls ?? [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [newTypeName, setNewTypeName] = useState('')
  const [addingType, setAddingType] = useState(false)

  const [customFields, setCustomFields] = useState<CustomField[]>(
    initial?.custom_fields && typeof initial.custom_fields === 'object'
      ? Object.entries(initial.custom_fields).map(([key, value]) => ({ key, value: String(value ?? '') }))
      : []
  )

  const [form, setForm] = useState({
    name: initial?.name ?? '',
    name_ar: initial?.name_ar ?? '',
    description: initial?.description ?? '',
    type_id: initial?.type_id ?? '',
    brand: initial?.brand ?? '',
    model: initial?.model ?? '',
    serial_number: initial?.serial_number ?? '',
    tracking_mode: initial?.tracking_mode ?? 'unit',
    quantity: initial?.quantity != null ? String(initial.quantity) : '1',
    site_id: initial?.site_id ?? '',
    space_id: initial?.space_id ?? '',
    status: initial?.status ?? 'in_storage',
    purchase_date: initial?.purchase_date ?? '',
    purchase_cost: initial?.purchase_cost != null ? String(initial.purchase_cost) : '',
    replacement_cost: initial?.replacement_cost != null ? String(initial.replacement_cost) : '',
    current_value_override: initial?.current_value_override != null ? String(initial.current_value_override) : '',
    expected_lifespan_years: initial?.expected_lifespan_years != null ? String(initial.expected_lifespan_years) : '',
    supplier_id: initial?.supplier_id ?? '',
    invoice_ref: initial?.invoice_ref ?? '',
    warranty_provider: initial?.warranty_provider ?? '',
    warranty_expiry: initial?.warranty_expiry ?? '',
    condition_rating: initial?.condition_rating != null ? String(initial.condition_rating) : '',
    is_usable: initial?.is_usable === false ? false : true,
    condition_notes: initial?.condition_notes ?? '',
    condition_review_interval_months: initial?.condition_review_interval_months != null ? String(initial.condition_review_interval_months) : '',
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRefs() }, [])

  async function loadRefs() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    setOrgId(profile.organisation_id)
    const [typesRes, sitesRes, spacesRes, vendorsRes] = await Promise.all([
      supabase.from('asset_log_types').select('id, name, name_ar').eq('is_active', true).order('name'),
      supabase.from('sites').select('id, name').order('name'),
      supabase.from('spaces').select('id, name, site_id, floor').order('name'),
      supabase.from('vendors').select('id, name').order('name'),
    ])
    if (typesRes.data) setTypes(typesRes.data)
    if (sitesRes.data) setSites(sitesRes.data)
    if (spacesRes.data) setSpaces(spacesRes.data)
    if (vendorsRes.data) setVendors(vendorsRes.data)
  }

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // Switching site clears a space that belongs to another site.
      if (key === 'site_id' && prev.space_id && spaces.find(s => s.id === prev.space_id)?.site_id !== value) {
        next.space_id = ''
      }
      // unit mode forces qty=1 (matches the DB CHECK + API).
      if (key === 'tracking_mode' && value === 'unit') next.quantity = '1'
      return next
    })
  }

  async function addType() {
    const name = newTypeName.trim()
    if (!name || !orgId) return
    setAddingType(true)
    const { data, error: e } = await supabase
      .from('asset_log_types')
      .insert({ organisation_id: orgId, name })
      .select('id, name, name_ar')
      .single()
    setAddingType(false)
    if (e) { setError(e.message); return }
    if (data) {
      setTypes(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      set('type_id', data.id)
      setNewTypeName('')
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const room = 10 - existingPhotos.length - photos.length
    const toAdd = files.slice(0, Math.max(0, room))
    setPhotos(prev => [...prev, ...toAdd])
    setPhotoPreviewUrls(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
  }
  function removeNewPhoto(i: number) {
    setPhotos(prev => prev.filter((_, idx) => idx !== i))
    setPhotoPreviewUrls(prev => prev.filter((_, idx) => idx !== i))
  }
  function removeExistingPhoto(i: number) {
    setExistingPhotos(prev => prev.filter((_, idx) => idx !== i))
  }

  async function uploadPhotos(): Promise<string[]> {
    const urls: string[] = []
    for (const file of photos) {
      const fd = new FormData()
      fd.append('file', file)
      const params = new URLSearchParams({ bucket: 'work-order-media', prefix: orgId + '/asset-log' })
      const res = await fetch('/api/upload?' + params.toString(), { method: 'POST', body: fd })
      if (res.ok) {
        const { publicUrl } = await res.json()
        urls.push(publicUrl)
      }
    }
    return urls
  }

  function customFieldsObject(): Record<string, string> {
    const obj: Record<string, string> = {}
    for (const { key, value } of customFields) {
      const k = key.trim()
      if (k) obj[k] = value
    }
    return obj
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError(isAr ? 'الاسم مطلوب' : 'Name is required'); return }
    setLoading(true)
    setError('')

    let uploaded: string[] = []
    if (photos.length > 0) uploaded = await uploadPhotos()
    const photo_urls = [...existingPhotos, ...uploaded]

    const payload: Record<string, unknown> = {
      ...form,
      quantity: form.tracking_mode === 'unit' ? 1 : parseInt(form.quantity, 10) || 1,
      photo_urls,
      custom_fields: customFieldsObject(),
    }

    const url = mode === 'create' ? '/api/asset-log' : '/api/asset-log/' + itemId
    const method = mode === 'create' ? 'POST' : 'PATCH'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.error ?? (isAr ? 'فشل الحفظ' : 'Save failed'))
      setLoading(false)
      return
    }
    const id = mode === 'create' ? data.item?.id : itemId
    router.push('/dashboard/asset-log/' + id)
  }

  const spacesForSite = spaces.filter(s => s.site_id === form.site_id)

  return (
    <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }} dir={isAr ? 'rtl' : 'ltr'}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href={mode === 'edit' ? '/dashboard/asset-log/' + itemId : '/dashboard/asset-log'} style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
          {isAr ? '→ رجوع' : '← Back'}
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>
          {mode === 'create' ? (isAr ? 'عنصر جديد' : 'New Item') : (isAr ? 'تعديل العنصر' : 'Edit Item')}
        </h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Identity */}
        <h2 style={sectionStyle}>{isAr ? 'التعريف' : 'Identity'}</h2>
        <div>
          <label style={labelStyle}>{isAr ? 'الاسم' : 'Name'}<span style={{ color: '#d32f2f' }}> *</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)} required style={fieldStyle} placeholder={isAr ? 'مثال: كرسي مكتب' : 'e.g. Office Chair'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
            <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} dir='rtl' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('asset_log.col.type')}</label>
            <select value={form.type_id} onChange={e => set('type_id', e.target.value)} style={fieldStyle}>
              <option value=''>{isAr ? 'بدون نوع' : 'No type'}</option>
              {types.map(ty => <option key={ty.id} value={ty.id}>{isAr && ty.name_ar ? ty.name_ar : ty.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder={isAr ? '+ نوع جديد' : '+ New type'}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addType() } }}
                style={{ ...fieldStyle, fontSize: 13, padding: '6px 10px' }} />
              <button type='button' onClick={addType} disabled={addingType || !newTypeName.trim()}
                style={{ background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, padding: '0 12px', fontSize: 13, cursor: 'pointer', opacity: addingType || !newTypeName.trim() ? 0.5 : 1 }}>
                {isAr ? 'إضافة' : 'Add'}
              </button>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div><label style={labelStyle}>{isAr ? 'العلامة' : 'Brand'}</label><input value={form.brand} onChange={e => set('brand', e.target.value)} style={fieldStyle} /></div>
          <div><label style={labelStyle}>{isAr ? 'الموديل' : 'Model'}</label><input value={form.model} onChange={e => set('model', e.target.value)} style={fieldStyle} /></div>
          <div><label style={labelStyle}>{isAr ? 'الرقم التسلسلي' : 'Serial No.'}</label><input value={form.serial_number} onChange={e => set('serial_number', e.target.value)} style={fieldStyle} /></div>
        </div>
        <div>
          <label style={labelStyle}>{isAr ? 'الوصف' : 'Description'}</label>
          <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>

        {/* Quantity */}
        <h2 style={sectionStyle}>{isAr ? 'الكمية' : 'Quantity'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{isAr ? 'وضع التتبع' : 'Tracking mode'}</label>
            <select value={form.tracking_mode} onChange={e => set('tracking_mode', e.target.value)} style={fieldStyle}>
              <option value='unit'>{isAr ? 'وحدة (فردي)' : 'Unit (individual)'}</option>
              <option value='bulk'>{isAr ? 'كمية (مجمّع)' : 'Bulk (quantity)'}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{t('asset_log.col.qty')}</label>
            <input type='number' min={1} value={form.tracking_mode === 'unit' ? '1' : form.quantity}
              onChange={e => set('quantity', e.target.value)} disabled={form.tracking_mode === 'unit'}
              style={{ ...fieldStyle, background: form.tracking_mode === 'unit' ? '#f4f4f4' : 'white' }} />
          </div>
        </div>

        {/* Location */}
        <h2 style={sectionStyle}>{isAr ? 'الموقع' : 'Location'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('common.site')}</label>
            <select value={form.site_id} onChange={e => set('site_id', e.target.value)} style={fieldStyle}>
              <option value=''>{isAr ? 'بدون موقع' : 'No site'}</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{isAr ? 'المساحة' : 'Space'}</label>
            <select value={form.space_id} onChange={e => set('space_id', e.target.value)} disabled={!form.site_id} style={fieldStyle}>
              <option value=''>{isAr ? 'بدون مساحة' : 'No space'}</option>
              {spacesForSite.map(s => <option key={s.id} value={s.id}>{s.name}{s.floor ? ' (' + s.floor + ')' : ''}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>{t('common.status')}</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} style={fieldStyle}>
            {ASSET_LOG_STATUSES.filter(s => s !== 'disposed').map(s => (
              <option key={s} value={s}>{t('asset_log.status.' + s)}</option>
            ))}
          </select>
        </div>

        {/* Purchase / cost */}
        <h2 style={sectionStyle}>{isAr ? 'الشراء والتكلفة' : 'Purchase & Cost'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={labelStyle}>{isAr ? 'تاريخ الشراء' : 'Purchase date'}</label><input type='date' value={form.purchase_date} onChange={e => set('purchase_date', e.target.value)} style={fieldStyle} /></div>
          <div><label style={labelStyle}>{isAr ? 'تكلفة الشراء (ريال)' : 'Purchase cost (SAR)'}</label><input type='number' value={form.purchase_cost} onChange={e => set('purchase_cost', e.target.value)} style={fieldStyle} /></div>
          <div><label style={labelStyle}>{isAr ? 'تكلفة الاستبدال' : 'Replacement cost'}</label><input type='number' value={form.replacement_cost} onChange={e => set('replacement_cost', e.target.value)} style={fieldStyle} /></div>
          <div><label style={labelStyle}>{isAr ? 'العمر المتوقع (سنوات)' : 'Expected lifespan (yrs)'}</label><input type='number' value={form.expected_lifespan_years} onChange={e => set('expected_lifespan_years', e.target.value)} style={fieldStyle} /></div>
          <div><label style={labelStyle}>{isAr ? 'قيمة حالية (تجاوز)' : 'Current value override'}</label><input type='number' value={form.current_value_override} onChange={e => set('current_value_override', e.target.value)} style={fieldStyle} /></div>
          <div>
            <label style={labelStyle}>{isAr ? 'المورد' : 'Supplier'}</label>
            <select value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)} style={fieldStyle}>
              <option value=''>{isAr ? 'بدون' : 'None'}</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>{isAr ? 'مرجع الفاتورة' : 'Invoice ref'}</label><input value={form.invoice_ref} onChange={e => set('invoice_ref', e.target.value)} style={fieldStyle} /></div>
        </div>

        {/* Warranty */}
        <h2 style={sectionStyle}>{isAr ? 'الضمان' : 'Warranty'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><label style={labelStyle}>{isAr ? 'مزوّد الضمان' : 'Warranty provider'}</label><input value={form.warranty_provider} onChange={e => set('warranty_provider', e.target.value)} style={fieldStyle} /></div>
          <div><label style={labelStyle}>{isAr ? 'انتهاء الضمان' : 'Warranty expiry'}</label><input type='date' value={form.warranty_expiry} onChange={e => set('warranty_expiry', e.target.value)} style={fieldStyle} /></div>
        </div>

        {/* Condition */}
        <h2 style={sectionStyle}>{t('asset_log.col.condition')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{isAr ? 'التقييم (1-5)' : 'Rating (1–5)'}</label>
            <select value={form.condition_rating} onChange={e => set('condition_rating', e.target.value)} style={fieldStyle}>
              <option value=''>—</option>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{isAr ? 'قابل للاستخدام' : 'Usable'}</label>
            <select value={form.is_usable ? 'yes' : 'no'} onChange={e => set('is_usable', e.target.value === 'yes')} style={fieldStyle}>
              <option value='yes'>{isAr ? 'نعم' : 'Yes'}</option>
              <option value='no'>{isAr ? 'لا' : 'No'}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{isAr ? 'فترة المراجعة (أشهر)' : 'Review interval (mo)'}</label>
            <input type='number' value={form.condition_review_interval_months} onChange={e => set('condition_review_interval_months', e.target.value)} style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>{isAr ? 'ملاحظات الحالة' : 'Condition notes'}</label>
          <textarea value={form.condition_notes} onChange={e => set('condition_notes', e.target.value)} rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>

        {/* Custom fields (JSONB) */}
        <h2 style={sectionStyle}>{isAr ? 'حقول مخصصة' : 'Custom fields'}</h2>
        {customFields.map((cf, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
            <input value={cf.key} placeholder={isAr ? 'المفتاح' : 'Field'} onChange={e => setCustomFields(prev => prev.map((c, idx) => idx === i ? { ...c, key: e.target.value } : c))} style={fieldStyle} />
            <input value={cf.value} placeholder={isAr ? 'القيمة' : 'Value'} onChange={e => setCustomFields(prev => prev.map((c, idx) => idx === i ? { ...c, value: e.target.value } : c))} style={fieldStyle} />
            <button type='button' onClick={() => setCustomFields(prev => prev.filter((_, idx) => idx !== i))} style={{ background: '#c62828', color: 'white', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer' }}>x</button>
          </div>
        ))}
        <button type='button' onClick={() => setCustomFields(prev => [...prev, { key: '', value: '' }])} style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed #bbb', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', color: '#555' }}>
          + {isAr ? 'إضافة حقل' : 'Add field'}
        </button>

        {/* Photos */}
        <h2 style={sectionStyle}>{isAr ? 'الصور' : 'Photos'}</h2>
        <div>
          <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed #ddd', borderRadius: 8, padding: '1.25rem', textAlign: 'center', cursor: 'pointer', color: '#999', fontSize: 13 }}>
            {existingPhotos.length + photos.length < 10
              ? (isAr ? 'اضغط لإضافة صور' : 'Click to add photos') + ` (${existingPhotos.length + photos.length}/10)`
              : (isAr ? 'الحد الأقصى 10 صور' : 'Maximum 10 photos')}
          </div>
          <input ref={fileInputRef} type='file' accept='image/*' multiple onChange={handlePhotoChange} style={{ display: 'none' }} />
          {(existingPhotos.length > 0 || photoPreviewUrls.length > 0) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {existingPhotos.map((url, i) => (
                <div key={'e' + i} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt='' style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                  <button type='button' onClick={() => removeExistingPhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c62828', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12 }}>x</button>
                </div>
              ))}
              {photoPreviewUrls.map((url, i) => (
                <div key={'n' + i} style={{ position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt='' style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                  <button type='button' onClick={() => removeNewPhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c62828', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12 }}>x</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </div>
  )
}
