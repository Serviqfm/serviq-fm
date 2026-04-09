'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function NewWorkOrderPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [assets, setAssets] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
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
  })

  useEffect(() => { loadFormData() }, [])

  async function loadFormData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id
    const [{ data: assetData }, { data: siteData }, { data: techData }] = await Promise.all([
      supabase.from('assets').select('id, name').eq('organisation_id', orgId).eq('status', 'active'),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
    ])
    if (assetData) setAssets(assetData)
    if (siteData) setSites(siteData)
    if (techData) setTechnicians(techData)
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
    const { error: insertError } = await supabase.from('work_orders').insert({
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
      source: 'manual',
      photo_urls: photoUrls,
    })
    if (insertError) { setError(insertError.message); setLoading(false) }
    else router.push('/dashboard/work-orders')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }
  const mediaExpiryDate = new Date()
  mediaExpiryDate.setMonth(mediaExpiryDate.getMonth() + 6)

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href="/dashboard/work-orders" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Work Orders</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>New Work Order</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input name="title" value={form.title} onChange={handleChange} required placeholder="e.g. AC unit not cooling - Room 204" style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea name="description" value={form.description} onChange={handleChange} rows={3} placeholder="Describe the issue in detail..." style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Priority *</label>
            <select name="priority" value={form.priority} onChange={handleChange} style={fieldStyle}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select name="category" value={form.category} onChange={handleChange} style={fieldStyle}>
              <option value="">Select category</option>
              <option value="HVAC">HVAC</option>
              <option value="Electrical">Electrical</option>
              <option value="Plumbing">Plumbing</option>
              <option value="Elevator / Lift">Elevator / Lift</option>
              <option value="Fire Safety">Fire Safety</option>
              <option value="Furniture">Furniture</option>
              <option value="Kitchen Equipment">Kitchen Equipment</option>
              <option value="Pool / Gym">Pool / Gym</option>
              <option value="IT Equipment">IT Equipment</option>
              <option value="Signage">Signage</option>
              <option value="Vehicle">Vehicle</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Site / Location</label>
            <select name="site_id" value={form.site_id} onChange={handleChange} style={fieldStyle}>
              <option value="">Select site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {sites.length === 0 && <p style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }}>No sites added yet</p>}
          </div>
          <div>
            <label style={labelStyle}>Asset</label>
            <select name="asset_id" value={form.asset_id} onChange={handleChange} style={fieldStyle}>
              <option value="">Select asset</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {assets.length === 0 && <p style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }}>No assets added yet</p>}
          </div>
        </div>
        {duplicateWarning && (
          <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f57f17' }}>
            {duplicateWarning}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Assign To</label>
            <select name="assigned_to" value={form.assigned_to} onChange={handleChange} style={fieldStyle}>
              <option value="">Unassigned</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>SLA (hours to resolve)</label>
            <input name="sla_hours" type="number" value={form.sla_hours} onChange={handleChange} placeholder="e.g. 24" min="1" style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Due Date</label>
          <input name="due_at" type="datetime-local" value={form.due_at} onChange={handleChange} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>
            Photos (up to 8)
            <span style={{ fontWeight: 400, color: '#999', marginLeft: 8, fontSize: 12 }}>Stored for 6 months until {mediaExpiryDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </label>
          <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed #ddd', borderRadius: 8, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', color: '#999', fontSize: 13 }}>
            {photos.length < 8 ? `Click to add photos (${photos.length}/8)` : 'Maximum 8 photos reached'}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handlePhotoChange} style={{ display: 'none' }} />
          {photoPreviewUrls.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {photoPreviewUrls.map((url, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                  <button type="button" onClick={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c62828', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12 }}>x</button>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Creating...' : 'Create Work Order'}
        </button>
      </form>
    </div>
  )
}
