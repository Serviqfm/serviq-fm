'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function NewAssetPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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
      const fileName = orgId + '/' + Date.now() + '-asset-' + file.name
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
    const qrCode = 'SERVIQ-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase()
    const { error: insertError } = await supabase.from('assets').insert({
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
      photo_urls: photoUrls,
      organisation_id: profile.organisation_id,
      status: 'active',
      qr_code: qrCode,
    })
    if (insertError) { setError(insertError.message); setLoading(false) }
    else router.push('/dashboard/assets')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/assets' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Assets</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Add New Asset</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Asset Name *</label>
          <input name='name' value={form.name} onChange={handleChange} required placeholder='e.g. Carrier AC Unit - Room 204' style={fieldStyle} />
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
            <input name='location_notes' value={form.location_notes} onChange={handleChange} placeholder='e.g. Near east stairwell' style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Manufacturer</label>
            <input name='manufacturer' value={form.manufacturer} onChange={handleChange} placeholder='e.g. Carrier' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Model</label>
            <input name='model' value={form.model} onChange={handleChange} placeholder='e.g. 42QHC018DS' style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Serial Number</label>
          <input name='serial_number' value={form.serial_number} onChange={handleChange} placeholder='e.g. SN-2024-00123' style={fieldStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Purchase Date</label>
            <input name='purchase_date' type='date' value={form.purchase_date} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Purchase Cost (SAR)</label>
            <input name='purchase_cost' type='number' value={form.purchase_cost} onChange={handleChange} placeholder='e.g. 12500' style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Warranty Expiry</label>
            <input name='warranty_expiry' type='date' value={form.warranty_expiry} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Expected Lifespan (years)</label>
            <input name='expected_lifespan_years' type='number' value={form.expected_lifespan_years} onChange={handleChange} placeholder='e.g. 10' style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea name='description' value={form.description} onChange={handleChange} rows={3} placeholder='Additional notes...' style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
        <div>
          <label style={labelStyle}>
            Photos (up to 10)
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
                  <img src={url} alt='' style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                  <button type='button' onClick={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c62828', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12 }}>x</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1565c0' }}>
          A unique QR code will be automatically generated for this asset when saved.
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Save Asset'}
        </button>
      </form>
    </div>
  )
}