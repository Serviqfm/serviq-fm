'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { C, F, primaryBtn, secondaryBtn, inputStyle, pageStyle, labelStyle, LUMINA_COLORS } from '@/lib/brand'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'

export default function EditAssetPage() {
  const router = useRouter()
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] || ''
  const supabase = createClient()
  const { isHidden, isRequired, loading: configLoading } = useFieldConfig('assets_edit')
  const isReq = (key: string) => isRequired(key) || isSystemRequired('assets_edit', key)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
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
  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return

    const [{ data: asset }, { data: siteData }] = await Promise.all([
      supabase.from('assets').select('*').eq('id', id).single(),
      supabase.from('sites').select('id, name').eq('organisation_id', profile.organisation_id).eq('is_active', true),
    ])

    if (siteData) setSites(siteData)
    if (asset) {
      setForm({
        name: asset.name ?? '',
        category: asset.category ?? '',
        site_id: asset.site_id ?? '',
        sub_location: asset.sub_location ?? '',
        serial_number: asset.serial_number ?? '',
        manufacturer: asset.manufacturer ?? '',
        model: asset.model ?? '',
        purchase_date: asset.purchase_date ?? '',
        purchase_cost: asset.purchase_cost ? String(asset.purchase_cost) : '',
        warranty_expiry: asset.warranty_expiry ?? '',
        expected_lifespan_years: asset.expected_lifespan_years ? String(asset.expected_lifespan_years) : '',
        description: asset.description ?? '',
        location_notes: asset.location_notes ?? '',
      })
    }
    setLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
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
        site_id: form.site_id,
        sub_location: form.sub_location,
        location_notes: form.location_notes,
        manufacturer: form.manufacturer,
        model: form.model,
        serial_number: form.serial_number,
        purchase_date: form.purchase_date,
        purchase_cost: form.purchase_cost,
        warranty_expiry: form.warranty_expiry,
        expected_lifespan_years: form.expected_lifespan_years,
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
