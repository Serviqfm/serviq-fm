'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { C, F, primaryBtn, secondaryBtn, inputStyle, pageStyle, labelStyle, LUMINA_COLORS } from '@/lib/brand'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'
import { useLanguage } from '@/context/LanguageContext'
import AssetCustomFields from '@/components/AssetCustomFields'
import { AssetStatus } from '@/lib/assetFields'
import { flattenAssetTree, getDescendantIds, MAX_ASSET_DEPTH, type FlatHierarchyAsset } from '../../asset-hierarchy'

export default function EditAssetPage() {
  const router = useRouter()
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] || ''
  const { lang } = useLanguage()
  const supabase = createClient()
  const { isHidden, isRequired, loading: configLoading } = useFieldConfig('assets_edit')
  const isReq = (key: string) => isRequired(key) || isSystemRequired('assets_edit', key)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spaces, setSpaces] = useState<any[]>([])
  const [parentOptions, setParentOptions] = useState<FlatHierarchyAsset[]>([])
  const [statuses, setStatuses] = useState<AssetStatus[]>([])
  const [customStatusId, setCustomStatusId] = useState('')
  // AL-02: full custom_fields map (org-defined + any free-form keys), preserved on save.
  const [customFields, setCustomFields] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    name: '',
    category: '',
    criticality: '',
    site_id: '',
    space_id: '',
    parent_asset_id: '',
    sub_location: '',
    serial_number: '',
    manufacturer: '',
    model: '',
    purchase_date: '',
    purchase_cost: '',
    warranty_expiry: '',
    expected_lifespan_years: '',
    salvage_value: '',
    useful_life_years: '',
    description: '',
    location_notes: '',
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return

    const [{ data: asset }, { data: siteData }, { data: assetData }, { data: spaceData }, { data: statusData }] = await Promise.all([
      supabase.from('assets').select('*').eq('id', id).single(),
      supabase.from('sites').select('id, name').eq('organisation_id', profile.organisation_id).eq('is_active', true),
      supabase.from('assets').select('id, name, parent_asset_id, site_id').eq('organisation_id', profile.organisation_id),
      supabase.from('spaces').select('id, name, site_id'),
      // AL-04: org custom statuses. Table may not exist pre-migration → null → hidden.
      supabase.from('asset_statuses').select('*').eq('organisation_id', profile.organisation_id).eq('is_active', true).order('sort_order'),
    ])

    if (siteData) setSites(siteData)
    if (spaceData) setSpaces(spaceData)
    if (statusData) setStatuses(statusData as AssetStatus[])
    if (assetData) {
      // Exclude the asset itself and all of its descendants from the parent dropdown.
      const descendants = getDescendantIds(assetData, id)
      setParentOptions(flattenAssetTree(assetData).filter(a => a.id !== id && !descendants.has(a.id)))
    }
    if (asset) {
      setForm({
        name: asset.name ?? '',
        category: asset.category ?? '',
        criticality: asset.criticality ?? '',
        site_id: asset.site_id ?? '',
        space_id: asset.space_id ?? '',
        parent_asset_id: asset.parent_asset_id ?? '',
        sub_location: asset.sub_location ?? '',
        serial_number: asset.serial_number ?? '',
        manufacturer: asset.manufacturer ?? '',
        model: asset.model ?? '',
        purchase_date: asset.purchase_date ?? '',
        purchase_cost: asset.purchase_cost ? String(asset.purchase_cost) : '',
        warranty_expiry: asset.warranty_expiry ?? '',
        expected_lifespan_years: asset.expected_lifespan_years ? String(asset.expected_lifespan_years) : '',
        salvage_value: asset.salvage_value != null ? String(asset.salvage_value) : '',
        useful_life_years: asset.useful_life_years != null ? String(asset.useful_life_years) : '',
        description: asset.description ?? '',
        location_notes: asset.location_notes ?? '',
      })
      setCustomStatusId(asset.custom_status_id ?? '')
      setCustomFields((asset.custom_fields as Record<string, string>) ?? {})
    }
    setLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm(prev => ({
      ...prev,
      [name]: value,
      // AL-21: changing the site clears a space that belongs to another site.
      ...(name === 'site_id' && prev.space_id && spaces.find(s => s.id === prev.space_id)?.site_id !== value
        ? { space_id: '' }
        : {}),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const res = await fetch(`/api/assets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        category: form.category,
        criticality: form.criticality,
        site_id: form.site_id,
        space_id: form.space_id,
        parent_asset_id: form.parent_asset_id,
        sub_location: form.sub_location,
        location_notes: form.location_notes,
        manufacturer: form.manufacturer,
        model: form.model,
        serial_number: form.serial_number,
        purchase_date: form.purchase_date,
        purchase_cost: form.purchase_cost,
        warranty_expiry: form.warranty_expiry,
        expected_lifespan_years: form.expected_lifespan_years,
        salvage_value: form.salvage_value,
        useful_life_years: form.useful_life_years,
        custom_status_id: customStatusId,
        custom_fields: customFields,
        description: form.description,
      }),
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(result?.error ?? 'Failed to update asset')
      setSaving(false)
      return
    }
    router.push('/dashboard/assets/' + id)
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (loading || configLoading) return <div style={{ padding: '2rem' }}>Loading...</div>

  const reqMark = (key: string) => isReq(key) ? <span style={{ color: '#d32f2f' }}> *</span> : null

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href={'/dashboard/assets/' + id} style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Asset</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Edit Asset</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {!isHidden('name') && (
          <div>
            <label style={labelStyle}>Asset Name{reqMark('name')}</label>
            <input name='name' value={form.name} onChange={handleChange} required={isReq('name')} style={fieldStyle} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('category') && (
            <div>
              <label style={labelStyle}>Category{reqMark('category')}</label>
              <select name='category' value={form.category} onChange={handleChange} required={isReq('category')} style={fieldStyle}>
                <option value=''>Select category</option>
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
              <label style={labelStyle}>Site{reqMark('site_id')}</label>
              <select name='site_id' value={form.site_id} onChange={handleChange} required={isReq('site_id')} style={fieldStyle}>
                <option value=''>Select site</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'الأهمية' : 'Criticality'}</label>
          <select name='criticality' value={form.criticality} onChange={handleChange} style={fieldStyle}>
            <option value=''>{lang === 'ar' ? 'اختر الأهمية' : 'Select criticality'}</option>
            <option value='low'>{lang === 'ar' ? 'منخفضة' : 'Low'}</option>
            <option value='medium'>{lang === 'ar' ? 'متوسطة' : 'Medium'}</option>
            <option value='high'>{lang === 'ar' ? 'عالية' : 'High'}</option>
            <option value='critical'>{lang === 'ar' ? 'حرجة' : 'Critical'}</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'الأصل الرئيسي (اختياري)' : 'Parent Asset (optional)'}</label>
          <select name='parent_asset_id' value={form.parent_asset_id} onChange={handleChange} style={fieldStyle}>
            <option value=''>{lang === 'ar' ? 'بدون — أصل رئيسي' : 'None — top-level asset'}</option>
            {parentOptions.map(a => (
              <option key={a.id} value={a.id} disabled={a.depth >= MAX_ASSET_DEPTH - 1}>
                {'— '.repeat(a.depth)}{a.name}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: '#999', margin: '4px 0 0' }}>
            {lang === 'ar' ? 'حتى ٤ مستويات من التسلسل الهرمي للأصول. لا يمكن اختيار الأصل نفسه أو أصوله الفرعية.' : 'Up to 4 levels of asset hierarchy. The asset itself and its child assets are excluded.'}
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {form.site_id && spaces.some(s => s.site_id === form.site_id) && (
            <div>
              <label style={labelStyle}>Space</label>
              <select name='space_id' value={form.space_id} onChange={handleChange} style={fieldStyle}>
                <option value=''>No space</option>
                {spaces.filter(s => s.site_id === form.site_id).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          {!isHidden('sub_location') && (
            <div>
              <label style={labelStyle}>Sub-location{reqMark('sub_location')}</label>
              <input name='sub_location' value={form.sub_location} onChange={handleChange} required={isReq('sub_location')} placeholder='e.g. Floor 2, Room 204' style={fieldStyle} />
            </div>
          )}
          {!isHidden('location_notes') && (
            <div>
              <label style={labelStyle}>Location Notes{reqMark('location_notes')}</label>
              <input name='location_notes' value={form.location_notes} onChange={handleChange} required={isReq('location_notes')} placeholder='e.g. Near east wall' style={fieldStyle} />
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('manufacturer') && (
            <div>
              <label style={labelStyle}>Manufacturer{reqMark('manufacturer')}</label>
              <input name='manufacturer' value={form.manufacturer} onChange={handleChange} required={isReq('manufacturer')} style={fieldStyle} />
            </div>
          )}
          {!isHidden('model') && (
            <div>
              <label style={labelStyle}>Model{reqMark('model')}</label>
              <input name='model' value={form.model} onChange={handleChange} required={isReq('model')} style={fieldStyle} />
            </div>
          )}
        </div>
        {!isHidden('serial_number') && (
          <div>
            <label style={labelStyle}>Serial Number{reqMark('serial_number')}</label>
            <input name='serial_number' value={form.serial_number} onChange={handleChange} required={isReq('serial_number')} style={fieldStyle} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('purchase_date') && (
            <div>
              <label style={labelStyle}>Purchase Date{reqMark('purchase_date')}</label>
              <input name='purchase_date' type='date' value={form.purchase_date} onChange={handleChange} required={isReq('purchase_date')} style={fieldStyle} />
            </div>
          )}
          {!isHidden('purchase_cost') && (
            <div>
              <label style={labelStyle}>Purchase Cost (SAR){reqMark('purchase_cost')}</label>
              <input name='purchase_cost' type='number' value={form.purchase_cost} onChange={handleChange} required={isReq('purchase_cost')} style={fieldStyle} />
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('warranty_expiry') && (
            <div>
              <label style={labelStyle}>Warranty Expiry{reqMark('warranty_expiry')}</label>
              <input name='warranty_expiry' type='date' value={form.warranty_expiry} onChange={handleChange} required={isReq('warranty_expiry')} style={fieldStyle} />
            </div>
          )}
          {!isHidden('expected_lifespan_years') && (
            <div>
              <label style={labelStyle}>Expected Lifespan (years){reqMark('expected_lifespan_years')}</label>
              <input name='expected_lifespan_years' type='number' value={form.expected_lifespan_years} onChange={handleChange} required={isReq('expected_lifespan_years')} style={fieldStyle} />
            </div>
          )}
        </div>
        {/* AL-04: custom status — maps to a base status server-side on save. */}
        {statuses.length > 0 && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'الحالة المخصّصة' : 'Custom Status'}</label>
            <select value={customStatusId} onChange={e => setCustomStatusId(e.target.value)} style={fieldStyle}>
              <option value=''>{lang === 'ar' ? 'بدون (الحالة الأساسية)' : 'None (base status)'}</option>
              {statuses.map(s => (
                <option key={s.id} value={s.id}>{lang === 'ar' && s.label_ar ? s.label_ar : s.label}</option>
              ))}
            </select>
          </div>
        )}
        {/* AL-05: depreciation inputs. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'القيمة المتبقية (ريال)' : 'Salvage Value (SAR)'}</label>
            <input name='salvage_value' type='number' value={form.salvage_value} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'العمر الإنتاجي للإهلاك (سنوات)' : 'Useful Life for Depreciation (years)'}</label>
            <input name='useful_life_years' type='number' value={form.useful_life_years} onChange={handleChange} style={fieldStyle} />
          </div>
        </div>
        <AssetCustomFields values={customFields} onChange={setCustomFields} />
        {!isHidden('description') && (
          <div>
            <label style={labelStyle}>Description{reqMark('description')}</label>
            <textarea name='description' value={form.description} onChange={handleChange} rows={3} required={isReq('description')} style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>
        )}
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type='submit' disabled={saving} style={{ flex: 1, background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <a href={'/dashboard/assets/' + id} style={{ flex: 1 }}>
            <button type='button' style={{ width: '100%', background: 'white', color: '#333', padding: '11px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', fontWeight: 500, fontSize: 15 }}>Cancel</button>
          </a>
        </div>
      </form>
    </div>
  )
}
