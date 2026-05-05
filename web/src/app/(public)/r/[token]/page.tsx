'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { C, F } from '@/lib/brand'

const CATEGORIES = ['HVAC','Electrical','Plumbing','Elevator/Lift','Fire Safety','Furniture','Kitchen Equipment','Pool/Gym','IT Equipment','Signage','Vehicle','Other']

export default function PublicRequestPage({ params }: { params: { token: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [space, setSpace] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitterName, setSubmitterName] = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', email: '', title: '', description: '', category: '' })
  const [photos, setPhotos] = useState<File[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('spaces')
        .select('*, site:site_id(id, name, organisation_id)')
        .eq('qr_token', params.token)
        .single()
      if (!data) { setNotFound(true); return }
      setSpace(data)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const photoUrls: string[] = []
    for (const photo of photos) {
      const path = `${Date.now()}-${photo.name}`
      const { error: upErr } = await supabase.storage.from('requests').upload(path, photo)
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('requests').getPublicUrl(path)
        photoUrls.push(publicUrl)
      }
    }

    let fileUrl = ''
    if (file) {
      const path = `${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('requests').upload(path, file)
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('requests').getPublicUrl(path)
        fileUrl = publicUrl
      }
    }

    const res = await fetch('/api/requests/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisation_id: space.site.organisation_id,
        site_id: space.site.id,
        space_id: space.id,
        site_name: space.site.name,
        requester_name: form.name,
        requester_email: form.email,
        requester_phone: form.phone,
        title: form.title,
        description: form.description,
        category: form.category,
        photo_urls: photoUrls,
        file_urls: fileUrl ? [fileUrl] : [],
      }),
    })

    if (!res.ok) {
      const { error: msg } = await res.json()
      setError(msg || 'Submission failed. Please try again.')
      setLoading(false)
      return
    }

    setSubmitterName(form.name)
    setSubmitterEmail(form.email)
    setSubmitted(true)
    setLoading(false)
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    border: `1px solid ${C.border}`, borderRadius: 8,
    fontSize: 14, fontFamily: F.en, color: C.textDark,
    background: C.white, boxSizing: 'border-box', outline: 'none',
  }

  if (notFound) return (
    <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 12px' }}>QR Code Not Active</h2>
        <p style={{ color: C.textLight, fontFamily: F.en, lineHeight: 1.6 }}>This QR code is no longer active. Please contact the building management team.</p>
      </div>
    </div>
  )

  if (!space) return (
    <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: C.textLight, fontFamily: F.en }}>Loading...</p>
    </div>
  )

  if (submitted) return (
    <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, maxWidth: 480, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 24 }}>✓</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 12px' }}>Request Submitted</h2>
        <p style={{ color: C.textMid, fontFamily: F.en, lineHeight: 1.6, margin: 0 }}>
          Thank you, {submitterName}. We&apos;ve received your request and sent a confirmation to <strong>{submitterEmail}</strong>. You can track your request status using the link in that email.
        </p>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 6px' }}>Submit a Maintenance Request</h1>
        <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: 0 }}>All requests are sent directly to the facility management team.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 20 }}>

          {/* Panel 1: Requester Info */}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', fontFamily: F.en }}>Your Info</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Full Name *</label>
                <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Your full name" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Phone</label>
                <input style={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+966 5x xxx xxxx" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Email *</label>
                <input style={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="you@example.com" />
              </div>
            </div>
          </div>

          {/* Panel 2: Request Details */}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', fontFamily: F.en }}>Request Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Title *</label>
                <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="Brief description of the issue" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Description *</label>
                <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required placeholder="Describe the issue in detail..." />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Category *</label>
                <select style={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required>
                  <option value="">Select category...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Panel 3: Attachments */}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', fontFamily: F.en }}>Attachments</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Photos (up to 3)</label>
                <input type="file" accept="image/*" multiple style={{ fontSize: 13, fontFamily: F.en, color: C.textMid }} onChange={e => {
                  const files = Array.from(e.target.files || []).slice(0, 3)
                  setPhotos(files)
                }} />
                {photos.length > 0 && <p style={{ fontSize: 11, color: C.textLight, margin: '4px 0 0', fontFamily: F.en }}>{photos.length} photo(s) selected</p>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>File Attachment (1)</label>
                <input type="file" style={{ fontSize: 13, fontFamily: F.en, color: C.textMid }} onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>
          </div>

          {/* Panel 4: Location (read-only) */}
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textMid, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', fontFamily: F.en }}>Location</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([['Site', space.site.name], ['Space', space.name], ['Floor', space.floor]] as [string,string][]).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontFamily: F.en }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.navy, fontFamily: F.en }}>{val}</div>
                </div>
              ))}
              {space.name_ar && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontFamily: F.en }}>Arabic Name</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.navy, fontFamily: F.ar, direction: 'rtl' }}>{space.name_ar}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div style={{ color: C.danger, marginBottom: 16, fontSize: 13, background: '#FEE2E2', padding: '10px 14px', borderRadius: 8, border: '1px solid #FECACA', fontFamily: F.en }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '13px', background: C.navy, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, fontFamily: F.en, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>
    </div>
  )
}
