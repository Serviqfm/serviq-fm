import os

os.makedirs('src/app/dashboard/assets/[id]/edit', exist_ok=True)

content = """'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

export default function EditAssetPage() {
  const router = useRouter()
  const { id } = useParams()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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
    const { error: updateError } = await supabase.from('assets').update({
      name: form.name,
      category: form.category || null,
      site_id: form.site_id || null,
      sub_location: form.sub_location || null,
      serial_number: form.serial_number || null,
      manufacturer: form.manufacturer || null,
      model: form.model || null,
      purchase_date: form.purchase_date || null,
      purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : null,
      warranty_expiry: form.warranty_expiry || null,
      expected_lifespan_years: form.expected_lifespan_years ? parseInt(form.expected_lifespan_years) : null,
      description: form.description || null,
      location_notes: form.location_notes || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    if (updateError) { setError(updateError.message); setSaving(false) }
    else router.push('/dashboard/assets/' + id)
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href={'/dashboard/assets/' + id} style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Asset</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Edit Asset</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Asset Name *</label>
          <input name='name' value={form.name} onChange={handleChange} required style={fieldStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Category</label>
            <select name='category' value={form.category} onChange={handleChange} style={fieldStyle}>
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
          <div>
            <label style={labelStyle}>Site</label>
            <select name='site_id' value={form.site_id} onChange={handleChange} style={fieldStyle}>
              <option value=''>Select site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Sub-location</label>
            <input name='sub_location' value={form.sub_location} onChange={handleChange} placeholder='e.g. Floor 2, Room 204' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Location Notes</label>
            <input name='location_notes' value={form.location_notes} onChange={handleChange} placeholder='e.g. Near east wall' style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Manufacturer</label>
            <input name='manufacturer' value={form.manufacturer} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Model</label>
            <input name='model' value={form.model} onChange={handleChange} style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Serial Number</label>
          <input name='serial_number' value={form.serial_number} onChange={handleChange} style={fieldStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Purchase Date</label>
            <input name='purchase_date' type='date' value={form.purchase_date} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Purchase Cost (SAR)</label>
            <input name='purchase_cost' type='number' value={form.purchase_cost} onChange={handleChange} style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Warranty Expiry</label>
            <input name='warranty_expiry' type='date' value={form.warranty_expiry} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Expected Lifespan (years)</label>
            <input name='expected_lifespan_years' type='number' value={form.expected_lifespan_years} onChange={handleChange} style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea name='description' value={form.description} onChange={handleChange} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
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
}"""

with open('src/app/dashboard/assets/[id]/edit/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Asset edit page written')