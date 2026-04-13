'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function RequesterPortalPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [sites, setSites] = useState<any[]>([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    site_id: '',
    priority: 'medium',
    requester_name: '',
    requester_phone: '',
  })
  const [photos, setPhotos] = useState<File[]>([])
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)

  useEffect(() => { loadUser() }, [])

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUser(user)
    const { data: profile } = await supabase.from('users').select('*, organisation_id').eq('id', user.id).single()
    if (profile) {
      setProfile(profile)
      setForm(prev => ({ ...prev, requester_name: profile.full_name ?? '' }))
      const { data: siteData } = await supabase.from('sites').select('id, name').eq('organisation_id', profile.organisation_id).eq('is_active', true)
      if (siteData) setSites(siteData)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const combined = [...photos, ...files].slice(0, 5)
    setPhotos(combined)
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  async function uploadPhotos(): Promise<string[]> {
    if (photos.length === 0) return []
    setUploadingPhotos(true)
    const urls: string[] = []
    for (const photo of photos) {
      const ext = photo.name.split('.').pop()
      const path = 'requests/' + profile.organisation_id + '/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext
      const { error } = await supabase.storage.from('media').upload(path, photo, { cacheControl: '3600', upsert: false })
      if (!error) {
        const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
        urls.push(urlData.publicUrl)
      }
    }
    setUploadingPhotos(false)
    return urls
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!profile) { setError('Please log in to submit a request'); setLoading(false); return }

    const uploadedUrls = await uploadPhotos()

    const { error: insertError } = await supabase.from('work_orders').insert({
      title: form.title,
      description: form.description,
      location_notes: form.location,
      site_id: form.site_id || null,
      priority: form.priority,
      status: 'new',
      source: 'requester',
      organisation_id: profile.organisation_id,
      created_by: user.id,
      requester_name: form.requester_name,
      requester_phone: form.requester_phone || null,
      photo_urls: uploadedUrls.length > 0 ? uploadedUrls : null,
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  const fieldStyle = {
    width: '100%', padding: '10px 14px', border: '1px solid #ddd',
    borderRadius: 10, fontSize: 14, boxSizing: 'border-box' as const,
    background: 'white', outline: 'none',
  }
  const labelStyle = {
    display: 'block' as const, marginBottom: 6,
    fontSize: 13, fontWeight: 500 as const, color: '#444'
  }

  const priorityOptions = [
    { value: 'low',      label: 'Low — not urgent',           color: '#2e7d32' },
    { value: 'medium',   label: 'Medium — needs attention',   color: '#f57f17' },
    { value: 'high',     label: 'High — affects operations',  color: '#e65100' },
    { value: 'critical', label: 'Critical — safety issue',    color: '#b71c1c' },
  ]

  if (success) return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '2.5rem', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: 28 }}>
          ✓
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 10px', color: '#1a1a2e' }}>Request Submitted</h2>
        <p style={{ fontSize: 14, color: '#666', margin: '0 0 8px' }}>
          Your maintenance request has been received and will be reviewed by the facilities team.
        </p>
        <p style={{ fontSize: 13, color: '#999', margin: '0 0 2rem' }}>You will be notified when your request is assigned and updated.</p>
        <button
          onClick={() => { setSuccess(false); setForm({ title: '', description: '', location: '', site_id: '', priority: 'medium', requester_name: profile?.full_name ?? '', requester_phone: '' }); setPhotos([]) }}
          style={{ background: '#1a1a2e', color: 'white', padding: '10px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
        >
          Submit Another Request
        </button>
      </div>
    </div>
  )

  if (!user) return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'white', borderRadius: 16, padding: '2.5rem', maxWidth: 400, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 12px', color: '#1a1a2e' }}>Maintenance Request Portal</h2>
        <p style={{ fontSize: 14, color: '#666', margin: '0 0 1.5rem' }}>Please log in to submit a maintenance request.</p>
        <a href='/login'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '10px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, width: '100%' }}>
            Log In
          </button>
        </a>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px', color: '#1a1a2e' }}>Submit a Maintenance Request</h1>
          <p style={{ fontSize: 14, color: '#999', margin: 0 }}>Describe the issue and our team will take care of it</p>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: '2rem', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            <div>
              <label style={labelStyle}>Your Name *</label>
              <input name='requester_name' value={form.requester_name} onChange={handleChange} required placeholder='Full name' style={fieldStyle} />
            </div>

            <div>
              <label style={labelStyle}>Phone Number</label>
              <input name='requester_phone' value={form.requester_phone} onChange={handleChange} placeholder='+966 5x xxx xxxx' style={fieldStyle} />
            </div>

            <div>
              <label style={labelStyle}>Issue Title *</label>
              <input name='title' value={form.title} onChange={handleChange} required placeholder='e.g. AC not working in Room 204' style={fieldStyle} />
            </div>

            <div>
              <label style={labelStyle}>Description *</label>
              <textarea
                name='description'
                value={form.description}
                onChange={handleChange}
                required
                placeholder='Describe the issue in as much detail as possible...'
                rows={4}
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={labelStyle}>Location</label>
              <input name='location' value={form.location} onChange={handleChange} placeholder='e.g. Floor 2, Room 204, near east wall' style={fieldStyle} />
            </div>

            {sites.length > 0 && (
              <div>
                <label style={labelStyle}>Building / Site</label>
                <select name='site_id' value={form.site_id} onChange={handleChange} style={fieldStyle}>
                  <option value=''>Select site</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label style={labelStyle}>Priority *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {priorityOptions.map(opt => (
                  <button
                    key={opt.value}
                    type='button'
                    onClick={() => setForm(prev => ({ ...prev, priority: opt.value }))}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '2px solid ' + (form.priority === opt.value ? opt.color : '#eee'),
                      background: form.priority === opt.value ? opt.color + '15' : 'white',
                      color: form.priority === opt.value ? opt.color : '#666',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: form.priority === opt.value ? 600 : 400,
                      textAlign: 'left' as const,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Photos (optional — max 5)</label>
              <div style={{ border: '2px dashed #ddd', borderRadius: 10, padding: '1rem', textAlign: 'center' as const }}>
                <input
                  type='file'
                  accept='image/*'
                  multiple
                  onChange={handlePhotoChange}
                  style={{ display: 'none' }}
                  id='photo-upload'
                />
                <label htmlFor='photo-upload' style={{ cursor: 'pointer', fontSize: 13, color: '#666' }}>
                  <span style={{ fontSize: 24, display: 'block', marginBottom: 4 }}>📷</span>
                  Tap to add photos of the issue
                  <span style={{ display: 'block', fontSize: 12, color: '#bbb', marginTop: 2 }}>Up to 5 images</span>
                </label>
              </div>
              {photos.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {photos.map((photo, i) => (
                    <div key={i} style={{ position: 'relative' as const }}>
                      <img
                        src={URL.createObjectURL(photo)}
                        alt={'Photo ' + (i + 1)}
                        style={{ width: 80, height: 80, objectFit: 'cover' as const, borderRadius: 8, border: '1px solid #ddd' }}
                      />
                      <button
                        type='button'
                        onClick={() => removePhoto(i)}
                        style={{ position: 'absolute' as const, top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c62828', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b71c1c' }}>
                {error}
              </div>
            )}

            <button
              type='submit'
              disabled={loading}
              style={{ background: '#1a1a2e', color: 'white', padding: '13px', borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 15, opacity: loading ? 0.7 : 1, marginTop: 4 }}
            >
              {loading ? (uploadingPhotos ? 'Uploading photos...' : 'Submitting...') : 'Submit Request'}
            </button>

          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#bbb', marginTop: '1.5rem' }}>
          Powered by Serviq-FM · <a href='/dashboard' style={{ color: '#bbb' }}>Manager Login</a>
        </p>
      </div>
    </div>
  )
}