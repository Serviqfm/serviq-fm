'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Logo } from '@/components/brand/Logo'

const STEPS = [
  { num: 1, label: 'Info' },
  { num: 2, label: 'Issue' },
  { num: 3, label: 'Location' },
  { num: 4, label: 'Evidence' },
]

const PRIORITY_OPTIONS = [
  { value: 'low',      label: 'Low',      sub: 'Not urgent',         active: 'border-primary text-primary bg-primary/5' },
  { value: 'medium',   label: 'Medium',   sub: 'Needs attention',    active: 'border-[#f57f17] text-[#f57f17] bg-[#f57f17]/5' },
  { value: 'high',     label: 'High',     sub: 'Affects operations', active: 'border-error text-error bg-error/5' },
  { value: 'critical', label: 'Critical', sub: 'Safety issue',       active: 'border-error bg-error text-on-error' },
]

const CATEGORIES = ['HVAC', 'Electrical', 'Plumbing', 'Elevator/Lift', 'Fire Safety', 'Furniture', 'Kitchen Equipment', 'Pool/Gym', 'IT Equipment', 'Signage', 'Vehicle', 'Other']

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-secondary'

export default function RequesterPortalPage() {
  const supabase = createClient()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [trackingToken, setTrackingToken] = useState('')
  const [error, setError] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profile, setProfile] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  const [form, setForm] = useState({
    requester_name: '',
    requester_email: '',
    requester_phone: '',
    title: '',
    description: '',
    category: '',
    priority: 'medium',
    location: '',
    site_id: '',
  })
  const [photos, setPhotos] = useState<File[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadUser() }, [])

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUser(user)
    const { data: profile } = await supabase.from('users').select('*, organisation_id').eq('id', user.id).single()
    if (profile) {
      setProfile(profile)
      setForm(prev => ({ ...prev, requester_name: profile.full_name ?? '', requester_email: user.email ?? '' }))
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
    setPhotos(prev => [...prev, ...files].slice(0, 5))
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

  async function handleSubmit() {
    setLoading(true)
    setError('')
    if (!profile) { setError('Please log in to submit a request'); setLoading(false); return }
    if (!form.category) { setError('Please choose a category (step 2)'); setLoading(false); return }
    // requests.site_id is NOT NULL, so a site is mandatory (matches the QR portal, which
    // always carries one). Orgs with no sites can't take requests through this queue.
    if (!form.site_id) {
      setError(sites.length === 0
        ? 'No sites are configured for your organisation yet — please contact an administrator.'
        : 'Please select a site (step 3)')
      setLoading(false); return
    }

    const uploadedUrls = await uploadPhotos()

    // DV-07: submit into the requests approval queue (like the QR portal) instead of
    // inserting a work order directly. `requests` has no priority/location columns, so
    // fold those into the description; a manager sets the real priority at approval.
    let description = form.description
    if (form.location) description += `\n\nLocation: ${form.location}`
    description += `\n\nSuggested priority: ${form.priority}`

    const res = await fetch('/api/requests/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organisation_id: profile.organisation_id,
        site_id: form.site_id || null,
        requester_name: form.requester_name,
        requester_email: form.requester_email,
        requester_phone: form.requester_phone || null,
        title: form.title,
        description,
        category: form.category,
        photo_urls: uploadedUrls,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Submission failed. Please try again.')
      setLoading(false)
      return
    }
    const { tracking_token } = await res.json()
    setTrackingToken(tracking_token || '')
    setSuccess(true)
    setLoading(false)
  }

  function reset() {
    setSuccess(false)
    setTrackingToken('')
    setStep(1)
    setError('')
    setPhotos([])
    setForm(prev => ({ ...prev, title: '', description: '', category: '', priority: 'medium', location: '', site_id: '', requester_phone: '' }))
  }

  function nextStep() {
    if (step === 1 && !form.requester_name.trim()) return
    if (step === 2 && (!form.title.trim() || !form.description.trim())) return
    setStep(s => s + 1)
  }

  const progressPct = ((step - 1) / (STEPS.length - 1)) * 100

  if (success) return (
    <div className="star-pattern bg-background min-h-screen flex items-center justify-center p-6">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-10 max-w-md w-full text-center shadow-sm">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
        </div>
        <h2 className="text-2xl font-bold text-on-surface mb-2">Request Submitted</h2>
        <p className="text-sm text-on-surface-variant mb-2">Your maintenance request has been received and is now pending review by the facilities team.</p>
        <p className="text-xs text-on-surface-variant/70 mb-6">You will be notified when your request is approved and assigned.</p>
        {trackingToken && (
          <a href={`/track/${trackingToken}`} className="block w-full border border-outline-variant text-on-surface py-3 rounded-xl font-semibold text-sm hover:bg-surface-container-low transition-colors mb-3">
            Track this request
          </a>
        )}
        <button onClick={reset} className="bg-primary text-on-primary px-6 py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors w-full">
          Submit Another Request
        </button>
        <a href="/request/mine" className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors mt-4">View all my requests / عرض كل طلباتي</a>
      </div>
    </div>
  )

  if (!user) return (
    <div className="star-pattern bg-background min-h-screen flex items-center justify-center p-6">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-10 max-w-sm w-full text-center shadow-sm">
        <span className="material-symbols-outlined text-primary text-4xl mb-4 block">assignment_late</span>
        <h2 className="text-xl font-bold text-on-surface mb-2">Maintenance Request Portal</h2>
        <p className="text-sm text-on-surface-variant mb-6">Please log in to submit a maintenance request.</p>
        <a href="/login" className="block w-full bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors text-center">Log In</a>
      </div>
    </div>
  )

  return (
    <div className="star-pattern bg-background text-on-surface min-h-screen flex flex-col">

      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant/30 shadow-sm">
        <div className="flex justify-between items-center w-full px-8 max-w-[1440px] mx-auto h-16 md:h-20">
          <Logo href="/" size={140} />
          <div className="flex items-center gap-6">
            <a href="/request/mine" className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors">My Requests / طلباتي</a>
            <a href="/dashboard" className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors">Manager Login</a>
          </div>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center justify-center px-6 py-10 gap-8">

        {/* Form card */}
        <div className="w-full max-w-2xl bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-sm overflow-hidden">

          {/* Banner */}
          <div className="bg-secondary p-6 text-on-secondary flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold leading-tight">Submit Request</h1>
              <p className="text-sm opacity-90 mt-0.5" style={{ fontFamily: 'Readex Pro, sans-serif' }}>تقديم طلب جديد</p>
            </div>
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-lg border border-white/20">
              <span className="material-symbols-outlined text-on-secondary text-lg">assignment_late</span>
              <span className="text-xs font-semibold uppercase tracking-wider">Public Portal</span>
            </div>
          </div>

          {/* Step progress */}
          <div className="px-8 pt-8 pb-4">
            <div className="flex justify-between relative">
              <div className="absolute top-5 left-0 w-full h-0.5 bg-surface-container-high z-0" />
              <div className="absolute top-5 left-0 h-0.5 bg-primary/40 z-0 transition-all duration-500" style={{ width: `${progressPct}%` }} />
              {STEPS.map(s => (
                <div key={s.num} className="relative z-10 flex flex-col items-center gap-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm text-sm transition-all ${step > s.num ? 'bg-primary text-on-primary' : step === s.num ? 'bg-primary/15 text-primary ring-2 ring-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    {step > s.num
                      ? <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check</span>
                      : s.num}
                  </div>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${step === s.num ? 'text-primary' : 'text-outline-variant'}`}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-8 space-y-6">

            {/* Step 1 — Info */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-baseline">
                    <label className={labelCls}>Full Name / الاسم الكامل</label>
                    <span className="text-error text-[10px] font-bold">Required</span>
                  </div>
                  <input name="requester_name" value={form.requester_name} onChange={handleChange} placeholder="e.g. Abdullah Ahmed" className={inputCls} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className={labelCls}>Email / البريد الإلكتروني</label>
                    <input name="requester_email" value={form.requester_email} onChange={handleChange} placeholder="name@company.com" type="email" className={inputCls} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={labelCls}>Phone / رقم الهاتف</label>
                    <input name="requester_phone" value={form.requester_phone} onChange={handleChange} placeholder="+966 5X XXX XXXX" type="tel" className={inputCls} />
                  </div>
                </div>
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex gap-3 items-start">
                  <span className="material-symbols-outlined text-primary flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>info</span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Privacy Notice</p>
                    <p className="text-xs text-on-surface-variant mt-1">Your details will only be used to update you on this request status. / سيتم استخدام بياناتك فقط لموافاتك بحالة الطلب.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 — Issue */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-baseline">
                    <label className={labelCls}>Issue Title / عنوان المشكلة</label>
                    <span className="text-error text-[10px] font-bold">Required</span>
                  </div>
                  <input name="title" value={form.title} onChange={handleChange} placeholder="e.g. AC not working in Room 204" className={inputCls} />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-baseline">
                    <label className={labelCls}>Description / الوصف</label>
                    <span className="text-error text-[10px] font-bold">Required</span>
                  </div>
                  <textarea name="description" value={form.description} onChange={handleChange} placeholder="Describe the issue in as much detail as possible..." rows={4} className={inputCls + ' resize-none'} />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-baseline">
                    <label className={labelCls}>Category / الفئة</label>
                    <span className="text-error text-[10px] font-bold">Required</span>
                  </div>
                  <select name="category" value={form.category} onChange={handleChange} className={inputCls}>
                    <option value="">Select category</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Priority / الأولوية</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PRIORITY_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => setForm(prev => ({ ...prev, priority: opt.value }))}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${form.priority === opt.value ? opt.active : 'border-outline-variant/40 text-on-surface-variant bg-surface-container-low'}`}>
                        <span className="block text-sm font-bold">{opt.label}</span>
                        <span className="block text-xs opacity-80 mt-0.5">{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 — Location */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Location Notes / ملاحظات الموقع</label>
                  <input name="location" value={form.location} onChange={handleChange} placeholder="e.g. Floor 2, Room 204, near east wall" className={inputCls} />
                </div>
                {sites.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <label className={labelCls}>Building / Site / المبنى</label>
                    <select name="site_id" value={form.site_id} onChange={handleChange} className={inputCls}>
                      <option value="">Select site</option>
                      {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Step 4 — Evidence */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className={labelCls}>Photos / الصور (optional — max 5)</label>
                  <label htmlFor="photo-upload" className="border-2 border-dashed border-outline-variant/40 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all">
                    <span className="material-symbols-outlined text-outline-variant text-4xl">photo_camera</span>
                    <p className="text-sm font-semibold text-on-surface-variant">Tap to add photos of the issue</p>
                    <p className="text-xs text-on-surface-variant/60">Up to 5 images · JPG, PNG, HEIC</p>
                    <input id="photo-upload" type="file" accept="image/*" multiple onChange={handlePhotoChange} className="hidden" />
                  </label>
                  {photos.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {photos.map((photo, i) => (
                        <div key={i} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={URL.createObjectURL(photo)} alt={'Photo ' + (i + 1)} className="w-20 h-20 object-cover rounded-xl border border-outline-variant" />
                          <button type="button" onClick={() => removePhoto(i)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error text-on-error flex items-center justify-center text-xs font-bold leading-none">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {error && (
                  <div className="bg-error/5 border border-error/30 rounded-xl p-3 text-sm text-error">{error}</div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex flex-col md:flex-row gap-3 pt-6 border-t border-outline-variant/20">
              {step > 1 && (
                <button type="button" onClick={() => setStep(s => s - 1)}
                  className="flex-1 border border-outline-variant/40 text-on-surface-variant py-4 rounded-xl font-semibold text-sm hover:bg-surface-container-low transition-all flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  Back
                </button>
              )}
              {step < 4 ? (
                <button type="button" onClick={nextStep}
                  className="flex-1 bg-primary text-on-primary py-4 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-sm">
                  Next Step / الخطوة التالية
                  <span className="material-symbols-outlined text-base">arrow_forward</span>
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} disabled={loading}
                  className="flex-1 bg-primary text-on-primary py-4 rounded-xl font-bold text-sm hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60">
                  {loading ? (uploadingPhotos ? 'Uploading...' : 'Submitting...') : 'Submit Request'}
                  {!loading && <span className="material-symbols-outlined text-base">send</span>}
                </button>
              )}
            </div>

          </div>
        </div>

        {/* Trust badges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl w-full">
          {[
            { icon: 'timer',    title: '2-Hour Response', desc: 'Our team initiates work within 2 hours of submission.' },
            { icon: 'security', title: 'Secure Portal',   desc: 'Encrypted submission via Saudi PDPL regulations.' },
            { icon: 'verified', title: 'Certified Techs', desc: 'All requests are handled by certified FM professionals.' },
          ].map(b => (
            <div key={b.icon} className="p-6 bg-surface-container-lowest/80 backdrop-blur-sm border border-outline-variant/40 rounded-xl text-center space-y-2">
              <span className="material-symbols-outlined text-primary text-3xl block">{b.icon}</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-secondary">{b.title}</h3>
              <p className="text-xs text-on-surface-variant">{b.desc}</p>
            </div>
          ))}
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-surface-container-low border-t border-outline-variant/30 mt-auto">
        <div className="w-full px-8 py-6 max-w-[1440px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex flex-col gap-2 items-start">
            <Logo href="/" size={110} />
            <p className="text-on-surface-variant text-xs">© 2026 Serviq FM. Saudi-made Facility Management.</p>
          </div>
          <div className="flex gap-6">
            <a href="#" className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors">ZATCA Compliance</a>
            <a href="#" className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors">Privacy Policy</a>
          </div>
        </div>
      </footer>

    </div>
  )
}
