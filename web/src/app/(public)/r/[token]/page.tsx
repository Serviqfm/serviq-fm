'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'

const CATEGORIES = ['HVAC','Electrical','Plumbing','Elevator/Lift','Fire Safety','Furniture','Kitchen Equipment','Pool/Gym','IT Equipment','Signage','Vehicle','Other']

export default function PublicRequestPage({ params }: { params: { token: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [space, setSpace] = useState<any>(null)
  const [notFound, setNotFound] = useState(false)
  const [notFoundDetail, setNotFoundDetail] = useState<string>('')
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
      // Stale QR codes printed before NEXT_PUBLIC_APP_URL was set encoded 'undefined' as the
      // token. Detect that explicitly so the user sees a helpful message instead of a generic
      // 'not active'.
      if (!params.token || params.token === 'undefined' || params.token === 'null') {
        setNotFoundDetail('This QR code points to an empty space token, likely printed before the QR system was fully configured. Please re-print from the dashboard.')
        setNotFound(true)
        return
      }
      // Use a server-side endpoint so the lookup goes through the service role and is not
      // blocked by spaces RLS (the anon client has no org membership).
      const res = await fetch(`/api/public/space-by-token/${params.token}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({ detail: '' }))
        setNotFoundDetail(j.detail ?? `Lookup failed (HTTP ${res.status}). Token: ${params.token}`)
        setNotFound(true)
        return
      }
      const { space: data } = await res.json()
      if (!data) { setNotFoundDetail(`No space matches token ${params.token}.`); setNotFound(true); return }
      setSpace(data)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Surface upload failures instead of swallowing them: the 'requests' bucket
    // enforces an image/PDF allowlist + 25 MB cap (DV-03), so a rejected file must
    // not vanish silently — abort and tell the requester how to fix it.
    const photoUrls: string[] = []
    for (const photo of photos) {
      const path = `${Date.now()}-${photo.name}`
      const { error: upErr } = await supabase.storage.from('requests').upload(path, photo)
      if (upErr) {
        setError(`Couldn't upload "${photo.name}". Please use a JPG, PNG, or WebP image under 25 MB.`)
        setLoading(false)
        return
      }
      const { data: { publicUrl } } = supabase.storage.from('requests').getPublicUrl(path)
      photoUrls.push(publicUrl)
    }

    let fileUrl = ''
    if (file) {
      const path = `${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('requests').upload(path, file)
      if (upErr) {
        setError(`Couldn't upload "${file.name}". Attachments must be an image or PDF under 25 MB.`)
        setLoading(false)
        return
      }
      const { data: { publicUrl } } = supabase.storage.from('requests').getPublicUrl(path)
      fileUrl = publicUrl
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

  const inputCls = "w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all box-border"

  if (notFound) return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center p-8">
      <div className="text-center max-w-[520px]">
        <div className="text-5xl mb-4">🚫</div>
        <h2 className="text-[22px] font-bold text-on-surface mb-3">QR Code Not Active</h2>
        <p className="text-on-surface-variant leading-relaxed mb-4">This QR code is no longer active. Please contact the building management team.</p>
        {notFoundDetail && (
          <p className="text-xs text-outline bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-2 mt-3 font-mono break-all">
            {notFoundDetail}
          </p>
        )}
      </div>
    </div>
  )

  if (!space) return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
      <p className="text-on-surface-variant">Loading...</p>
    </div>
  )

  if (submitted) return (
    <div className="min-h-[calc(100vh-56px)] flex items-center justify-center p-8">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[16px] shadow-sm p-10 max-w-[480px] text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-5 text-2xl text-primary">✓</div>
        <h2 className="text-[22px] font-bold text-on-surface mb-3">Request Submitted</h2>
        <p className="text-on-surface-variant leading-relaxed">
          Thank you, {submitterName}. We&apos;ve received your request and sent a confirmation to <strong>{submitterEmail}</strong>. You can track your request status using the link in that email.
        </p>
      </div>
    </div>
  )

  return (
    <div className="px-6 py-8 max-w-[1100px] mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-on-surface mb-1.5">Submit a Maintenance Request</h1>
        <p className="text-sm text-on-surface-variant">All requests are sent directly to the facility management team.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5 mb-5">

          {/* Panel 1: Requester Info */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
            <h3 className="text-[13px] font-bold text-on-surface-variant uppercase tracking-[0.06em] mb-4">Your Info</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Full Name *</label>
                <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Your full name" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Phone</label>
                <input className={inputCls} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+966 5x xxx xxxx" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Email *</label>
                <input className={inputCls} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="you@example.com" />
              </div>
            </div>
          </div>

          {/* Panel 2: Request Details */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
            <h3 className="text-[13px] font-bold text-on-surface-variant uppercase tracking-[0.06em] mb-4">Request Details</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Title *</label>
                <input className={inputCls} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="Brief description of the issue" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Description *</label>
                <textarea className={`${inputCls} min-h-[80px] resize-y`} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required placeholder="Describe the issue in detail..." />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Category *</label>
                <select className={inputCls} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required>
                  <option value="">Select category...</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Panel 3: Attachments */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
            <h3 className="text-[13px] font-bold text-on-surface-variant uppercase tracking-[0.06em] mb-4">Attachments</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Photos (up to 3)</label>
                <input type="file" accept="image/*" multiple className="text-sm text-on-surface-variant" onChange={e => {
                  const files = Array.from(e.target.files || []).slice(0, 3)
                  setPhotos(files)
                }} />
                {photos.length > 0 && <p className="text-[11px] text-on-surface-variant mt-1">{photos.length} photo(s) selected</p>}
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">File Attachment (1)</label>
                <input type="file" accept="image/*,application/pdf" className="text-sm text-on-surface-variant" onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>
          </div>

          {/* Panel 4: Location (read-only) */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
            <h3 className="text-[13px] font-bold text-on-surface-variant uppercase tracking-[0.06em] mb-4">Location</h3>
            <div className="flex flex-col gap-2.5">
              {([['Site', space.site.name], ['Space', space.name], ['Floor', space.floor]] as [string,string][]).map(([label, val]) => (
                <div key={label}>
                  <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.05em] mb-0.5">{label}</div>
                  <div className="text-sm font-medium text-on-surface">{val}</div>
                </div>
              ))}
              {space.name_ar && (
                <div>
                  <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-[0.05em] mb-0.5">Arabic Name</div>
                  <div className="text-sm font-medium text-on-surface text-right" dir="rtl">{space.name_ar}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="text-error mb-4 text-sm bg-error/10 px-3.5 py-2.5 rounded-xl border border-error/20">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3.5 bg-primary text-on-primary border-none rounded-[10px] cursor-pointer font-bold text-[15px] hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}>
          {loading ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>
    </div>
  )
}
