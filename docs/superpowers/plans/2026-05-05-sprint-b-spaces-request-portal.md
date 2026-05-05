# Sprint B — Spaces & Public Request Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Spaces within Sites (QR codes, floor grouping, bulk PDF export) and a public request portal (no-auth form, admin review, requester email tracking).

**Architecture:** Public pages live in a `(public)` route group with a minimal layout; dashboard pages follow the existing pattern. Email via Nodemailer + Hostinger SMTP. QR codes via `qrcode` npm package. PDF export via `@react-pdf/renderer`.

**Tech Stack:** Next.js 14 App Router, Supabase, Nodemailer, qrcode, @react-pdf/renderer, inline styles with brand constants.

---

### Task 1: Install packages & add env vars

**Files:**
- Modify: `web/package.json` (via npm install)
- Modify: `web/.env.local`

- [ ] **Step 1: Install packages**

Run from `web/` directory:
```bash
npm install qrcode nodemailer
npm install --save-dev @types/qrcode @types/nodemailer
```

- [ ] **Step 2: Add email env vars to web/.env.local**

Append to `web/.env.local`:
```
EMAIL_HOST=smtp.hostinger.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=admin@serviqfm.com
EMAIL_PASS=your_hostinger_password_here
EMAIL_FROM=ServIQ-FM <admin@serviqfm.com>
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `npm run build --dry-run` or just `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "chore: install qrcode, nodemailer packages for Sprint B"
```

---

### Task 2: Database migrations (run in Supabase SQL editor)

**Files:** None — run directly in Supabase Dashboard → SQL Editor

- [ ] **Step 1: Create spaces table**

Run in Supabase SQL editor:
```sql
CREATE TABLE spaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  site_id         uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name            text NOT NULL,
  name_ar         text,
  floor           text NOT NULL,
  description     text,
  qr_token        uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members can manage spaces"
  ON spaces FOR ALL
  USING (organisation_id = (SELECT organisation_id FROM users WHERE id = auth.uid()));
```

- [ ] **Step 2: Create requests table**

Run in Supabase SQL editor:
```sql
CREATE TABLE requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  site_id          uuid NOT NULL REFERENCES sites(id),
  space_id         uuid REFERENCES spaces(id),
  requester_name   text NOT NULL,
  requester_email  text NOT NULL,
  requester_phone  text,
  title            text NOT NULL,
  description      text NOT NULL,
  category         text NOT NULL,
  photo_urls       text[] NOT NULL DEFAULT '{}',
  file_urls        text[] NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected')),
  work_order_id    uuid REFERENCES work_orders(id),
  rejection_reason text,
  tracking_token   uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public can submit requests"
  ON requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "public can track own request"
  ON requests FOR SELECT
  USING (true);

CREATE POLICY "org members can manage requests"
  ON requests FOR ALL
  USING (organisation_id = (SELECT organisation_id FROM users WHERE id = auth.uid()));
```

- [ ] **Step 3: Alter existing tables**

Run in Supabase SQL editor:
```sql
ALTER TABLE assets ADD COLUMN IF NOT EXISTS space_id uuid REFERENCES spaces(id);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES requests(id);
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS space_id   uuid REFERENCES spaces(id);
```

- [ ] **Step 4: Create Supabase Storage bucket for request attachments**

In Supabase Dashboard → Storage → New bucket:
- Name: `requests`
- Public: false
- File size limit: 10MB

---

### Task 3: Email utility

**Files:**
- Create: `web/src/lib/email.ts`

- [ ] **Step 1: Create email.ts**

```typescript
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
})

function emailTemplate(title: string, bodyHtml: string, trackingUrl?: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'DM Sans',Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E2E8F0">
    <div style="background:#0F2044;padding:24px 32px;display:flex;align-items:center;gap:12px">
      <span style="font-size:20px;font-weight:800;color:#fff">Serviq<span style="background:linear-gradient(90deg,#6DCFB0,#1A7FC1);-webkit-background-clip:text;-webkit-text-fill-color:transparent">FM</span></span>
    </div>
    <div style="padding:32px">
      <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0F2044">${title}</h2>
      ${bodyHtml}
      ${trackingUrl ? `
      <div style="margin-top:28px;text-align:center">
        <a href="${trackingUrl}" style="display:inline-block;background:#0F2044;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px">Track Your Request →</a>
      </div>` : ''}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #E2E8F0;font-size:12px;color:#94A3B8;text-align:center">
      ServIQ-FM · Facility Management Platform
    </div>
  </div>
</body>
</html>`
}

export async function sendRequestConfirmation(opts: {
  to: string; name: string; siteName: string; title: string; trackingUrl: string
}) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: `Request received — ${opts.siteName}`,
    html: emailTemplate(
      'Request Received',
      `<p style="color:#334155;line-height:1.6">Hi ${opts.name},</p>
       <p style="color:#334155;line-height:1.6">We've received your maintenance request <strong>"${opts.title}"</strong> at <strong>${opts.siteName}</strong>. Our team will review it shortly.</p>`,
      opts.trackingUrl
    ),
  })
}

export async function sendRequestApproved(opts: {
  to: string; name: string; siteName: string; woNumber: string; trackingUrl: string
}) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: `Your request has been approved — ${opts.woNumber}`,
    html: emailTemplate(
      'Request Approved',
      `<p style="color:#334155;line-height:1.6">Hi ${opts.name},</p>
       <p style="color:#334155;line-height:1.6">Great news! Your request at <strong>${opts.siteName}</strong> has been approved and a work order <strong>${opts.woNumber}</strong> has been created. A technician will be assigned shortly.</p>`,
      opts.trackingUrl
    ),
  })
}

export async function sendRequestRejected(opts: {
  to: string; name: string; siteName: string; reason?: string; trackingUrl: string
}) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: `Update on your request — ${opts.siteName}`,
    html: emailTemplate(
      'Request Update',
      `<p style="color:#334155;line-height:1.6">Hi ${opts.name},</p>
       <p style="color:#334155;line-height:1.6">We've reviewed your maintenance request at <strong>${opts.siteName}</strong>. Unfortunately, we're unable to proceed at this time.</p>
       ${opts.reason ? `<p style="color:#334155;line-height:1.6"><strong>Reason:</strong> ${opts.reason}</p>` : ''}`,
      opts.trackingUrl
    ),
  })
}

export async function sendWOStatusUpdate(opts: {
  to: string; name: string; siteName: string; status: 'in_progress' | 'completed' | 'finished'; trackingUrl: string
}) {
  const subjects: Record<string, string> = {
    in_progress: 'Work has started on your request',
    completed: 'Your request has been completed',
    finished: `Request closed — ${opts.siteName}`,
  }
  const bodies: Record<string, string> = {
    in_progress: `A technician has started working on your maintenance request at <strong>${opts.siteName}</strong>.`,
    completed: `The work on your maintenance request at <strong>${opts.siteName}</strong> has been completed.`,
    finished: `Your maintenance request at <strong>${opts.siteName}</strong> has been officially closed.`,
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: opts.to,
    subject: subjects[opts.status],
    html: emailTemplate(
      subjects[opts.status],
      `<p style="color:#334155;line-height:1.6">Hi ${opts.name},</p>
       <p style="color:#334155;line-height:1.6">${bodies[opts.status]}</p>`,
      opts.trackingUrl
    ),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/email.ts
git commit -m "feat: add Nodemailer email utility with 4 email types"
```

---

### Task 4: Public layout + route group

**Files:**
- Create: `web/src/app/(public)/layout.tsx`

- [ ] **Step 1: Create the public route group layout**

```typescript
import { type ReactNode } from 'react'
import { C, F } from '@/lib/brand'

const gradH = 'linear-gradient(90deg, #6DCFB0 0%, #3AAECC 50%, #1A7FC1 100%)'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: F.en, background: C.pageBg }}>
        <header style={{
          background: C.white,
          borderBottom: `1px solid ${C.border}`,
          padding: '0 32px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
        }}>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 800, fontFamily: F.en, background: gradH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>S</span>
            </div>
            <div>
              <span style={{ fontSize: 16, fontWeight: 700, color: C.navy, fontFamily: F.en }}>
                Serviq<span style={{ background: gradH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>FM</span>
              </span>
            </div>
          </a>
        </header>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/\(public\)/layout.tsx
git commit -m "feat: add minimal public layout for no-auth portal pages"
```

---

### Task 5: Public request form `/r/[token]`

**Files:**
- Create: `web/src/app/(public)/r/[token]/page.tsx`

- [ ] **Step 1: Create the public request form page**

```typescript
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

  const [form, setForm] = useState({
    name: '', phone: '', email: '',
    title: '', description: '', category: '',
  })
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

  const inp = {
    width: '100%', padding: '10px 12px',
    border: `1px solid ${C.border}`, borderRadius: 8,
    fontSize: 14, fontFamily: F.en, color: C.textDark,
    background: C.white, boxSizing: 'border-box' as const, outline: 'none',
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
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textMid, textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 16px', fontFamily: F.en }}>Your Info</h3>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
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
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textMid, textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 16px', fontFamily: F.en }}>Request Details</h3>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Title *</label>
                <input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required placeholder="Brief description of the issue" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Description *</label>
                <textarea style={{ ...inp, minHeight: 80, resize: 'vertical' as const }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required placeholder="Describe the issue in detail..." />
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
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textMid, textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 16px', fontFamily: F.en }}>Attachments</h3>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
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
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.textMid, textTransform: 'uppercase' as const, letterSpacing: '0.06em', margin: '0 0 16px', fontFamily: F.en }}>Location</h3>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              {[
                ['Site', space.site.name],
                ['Space', space.name],
                ['Floor', space.floor],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 2, fontFamily: F.en }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.navy, fontFamily: F.en }}>{val}</div>
                </div>
              ))}
              {space.name_ar && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 2, fontFamily: F.en }}>Arabic Name</div>
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
```

- [ ] **Step 2: Commit**

```bash
git add "web/src/app/(public)/r/[token]/page.tsx"
git commit -m "feat: public request form at /r/[token]"
```

---

### Task 6: API route — submit request

**Files:**
- Create: `web/src/app/api/requests/submit/route.ts`

- [ ] **Step 1: Create the submit API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRequestConfirmation } from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await req.json()
  const {
    organisation_id, site_id, space_id, site_name,
    requester_name, requester_email, requester_phone,
    title, description, category, photo_urls, file_urls,
  } = body

  if (!requester_name || !requester_email || !title || !description || !category) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: request, error } = await supabase
    .from('requests')
    .insert({
      organisation_id, site_id, space_id,
      requester_name, requester_email, requester_phone,
      title, description, category,
      photo_urls: photo_urls || [],
      file_urls: file_urls || [],
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${request.tracking_token}`

  try {
    await sendRequestConfirmation({
      to: requester_email,
      name: requester_name,
      siteName: site_name,
      title,
      trackingUrl,
    })
  } catch {
    // email failure should not fail the request submission
  }

  return NextResponse.json({ success: true, tracking_token: request.tracking_token })
}
```

- [ ] **Step 2: Add NEXT_PUBLIC_APP_URL to .env.local**

```
NEXT_PUBLIC_APP_URL=https://serviqfm.com
```

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/requests/submit/route.ts
git commit -m "feat: public request submit API with email confirmation"
```

---

### Task 7: Request tracking page `/track/[token]`

**Files:**
- Create: `web/src/app/(public)/track/[token]/page.tsx`

- [ ] **Step 1: Create the tracking page**

```typescript
import { createClient } from '@supabase/supabase-js'
import { C, F } from '@/lib/brand'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function TrackRequestPage({ params }: { params: { token: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: request } = await supabase
    .from('requests')
    .select('*, site:site_id(name), space:space_id(name, floor), work_order:work_order_id(wo_number, status, assigned_to)')
    .eq('tracking_token', params.token)
    .single()

  if (!request) return (
    <div style={{ minHeight: 'calc(100vh - 56px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 12px' }}>Tracking Link Invalid</h2>
        <p style={{ color: C.textLight, fontFamily: F.en, lineHeight: 1.6 }}>This tracking link is no longer valid.</p>
      </div>
    </div>
  )

  const woNum = request.work_order?.wo_number
    ? `WO-${String(request.work_order.wo_number).padStart(4, '0')}`
    : null

  const steps = [
    { key: 'submitted', label: 'Submitted', done: true },
    { key: 'review', label: 'Under Review', done: request.status !== 'pending' },
    {
      key: 'outcome',
      label: request.status === 'rejected' ? 'Rejected' : `Approved${woNum ? ` — ${woNum}` : ''}`,
      done: request.status === 'approved' || request.status === 'rejected',
      failed: request.status === 'rejected',
    },
    ...(request.status === 'approved' && request.work_order ? [
      { key: 'assigned', label: 'Technician Assigned', done: ['in_progress','on_hold','completed','finished'].includes(request.work_order.status) },
      { key: 'in_progress', label: 'In Progress', done: ['on_hold','completed','finished'].includes(request.work_order.status) },
      { key: 'completed', label: 'Completed', done: ['finished'].includes(request.work_order.status) },
      { key: 'finished', label: 'Closed', done: request.work_order.status === 'finished' },
    ] : []),
  ]

  return (
    <div style={{ padding: '32px 24px', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
          {request.site?.name}{request.space ? ` · ${request.space.name} (${request.space.floor})` : ''}
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 4px' }}>{request.title}</h1>
        <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: 0 }}>
          Submitted {format(new Date(request.created_at), 'dd MMM yyyy')} · {request.category}
        </p>
      </div>

      {request.description && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: F.en }}>Description</div>
          <p style={{ fontSize: 14, color: C.textMid, lineHeight: 1.6, margin: 0, fontFamily: F.en }}>{request.description}</p>
        </div>
      )}

      {/* Status Timeline */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 20, fontFamily: F.en }}>Request Status</div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 0 }}>
          {steps.map((step, i) => (
            <div key={step.key} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: step.failed ? '#FEE2E2' : step.done ? '#DCFCE7' : C.pageBg,
                  border: `2px solid ${step.failed ? C.danger : step.done ? C.success : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13,
                }}>
                  {step.failed ? '✗' : step.done ? '✓' : ''}
                </div>
                {i < steps.length - 1 && (
                  <div style={{ width: 2, height: 28, background: step.done ? C.success : C.border, margin: '2px 0' }} />
                )}
              </div>
              <div style={{ paddingTop: 4, paddingBottom: i < steps.length - 1 ? 0 : 0 }}>
                <span style={{
                  fontSize: 14, fontWeight: step.done ? 600 : 400,
                  color: step.failed ? C.danger : step.done ? C.navy : C.textLight,
                  fontFamily: F.en,
                }}>{step.label}</span>
                {step.key === 'outcome' && request.status === 'rejected' && request.rejection_reason && (
                  <p style={{ fontSize: 12, color: C.textLight, margin: '2px 0 0', fontFamily: F.en }}>{request.rejection_reason}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "web/src/app/(public)/track/[token]/page.tsx"
git commit -m "feat: request tracking page at /track/[token]"
```

---

### Task 8: Spaces list page

**Files:**
- Create: `web/src/app/dashboard/sites/[id]/spaces/page.tsx`

- [ ] **Step 1: Create spaces list page**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, pageStyle, primaryBtn, secondaryBtn, dangerBtn } from '@/lib/brand'
import QRCode from 'qrcode'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'

export default function SpacesPage({ params }: { params: { id: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [site, setSite] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spaces, setSpaces] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [qrModal, setQrModal] = useState<any>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [showExport, setShowExport] = useState(false)
  const [exportFloor, setExportFloor] = useState('all')
  const [exportLayout, setExportLayout] = useState<2|4|6>(4)
  const [exporting, setExporting] = useState(false)
  const supabase = createClient()
  const { lang } = useLanguage()

  useEffect(() => { fetchData() }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    setLoading(true)
    const { data: siteData } = await supabase.from('sites').select('*').eq('id', params.id).single()
    if (siteData) setSite(siteData)
    const { data } = await supabase.from('spaces').select('*').eq('site_id', params.id).order('floor').order('name')
    if (data) setSpaces(data)
    setLoading(false)
  }

  async function deleteSpace(id: string) {
    if (!confirm('Delete this space? This cannot be undone.')) return
    await supabase.from('spaces').delete().eq('id', id)
    fetchData()
  }

  async function openQr(space: { qr_token: string; name: string; floor: string }) {
    setQrModal(space)
    const url = `${APP_URL}/r/${space.qr_token}`
    const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 2 })
    setQrDataUrl(dataUrl)
  }

  async function handleExportPdf() {
    setExporting(true)
    const filtered = exportFloor === 'all' ? spaces : spaces.filter(s => s.floor === exportFloor)
    const res = await fetch('/api/spaces/export-qr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceIds: filtered.map(s => s.id), layout: exportLayout, siteName: site?.name }),
    })
    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-codes-${site?.name || 'spaces'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    }
    setExporting(false)
    setShowExport(false)
  }

  // Group by floor
  const floors = [...new Set(spaces.map(s => s.floor))]
  const uniqueFloors = [...new Set(spaces.map(s => s.floor))]

  return (
    <div style={{ ...pageStyle, maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap' as const, gap: 12 }}>
        <div>
          <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 4px' }}>
            <Link href="/dashboard/sites" style={{ color: C.blue, textDecoration: 'none' }}>Sites</Link>
            {' / '}{site?.name || '...'}
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 4px' }}>Spaces</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: 0 }}>{spaces.length} space{spaces.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowExport(true)} style={{ ...secondaryBtn, fontSize: 13 }}>Export QR Codes</button>
          <Link href={`/dashboard/sites/${params.id}/spaces/new`}>
            <button style={{ ...primaryBtn, fontSize: 13 }}>Add Space +</button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>Loading...</p>
      ) : spaces.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.textLight, fontFamily: F.en }}>
          <p style={{ fontSize: 18 }}>No spaces yet. Add your first space to generate QR codes.</p>
        </div>
      ) : (
        floors.map(floor => (
          <div key={floor} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{floor}</h2>
              <span style={{ fontSize: 12, color: C.textLight, fontFamily: F.en }}>
                {spaces.filter(s => s.floor === floor).length} space{spaces.filter(s => s.floor === floor).length !== 1 ? 's' : ''}
              </span>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
              {spaces.filter(s => s.floor === floor).map(space => (
                <div key={space.id} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 2px', color: C.textDark, fontFamily: F.en }}>{space.name}</h3>
                  {space.name_ar && <p style={{ fontSize: 13, color: C.textMid, margin: '0 0 4px', direction: 'rtl', fontFamily: F.ar }}>{space.name_ar}</p>}
                  {space.description && <p style={{ fontSize: 12, color: C.textLight, margin: '0 0 12px', fontFamily: F.en, lineHeight: 1.5 }}>{space.description}</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <Link href={`/dashboard/sites/${params.id}/spaces/${space.id}/edit`}>
                      <button style={{ ...secondaryBtn, padding: '5px 12px', fontSize: 12 }}>Edit</button>
                    </Link>
                    <button onClick={() => openQr(space)} style={{ ...secondaryBtn, padding: '5px 12px', fontSize: 12 }}>QR Code</button>
                    <button onClick={() => deleteSpace(space.id)} style={{ ...dangerBtn, padding: '5px 12px', fontSize: 12 }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* QR Modal */}
      {qrModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: 32, maxWidth: 360, width: '100%', textAlign: 'center' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, margin: '0 0 4px', fontFamily: F.en }}>{qrModal.name}</h3>
            <p style={{ fontSize: 13, color: C.textLight, margin: '0 0 20px', fontFamily: F.en }}>{qrModal.floor} · {site?.name}</p>
            {qrDataUrl && <img src={qrDataUrl} alt="QR Code" style={{ width: 200, height: 200, margin: '0 auto 20px', display: 'block' }} />}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <a href={qrDataUrl} download={`qr-${qrModal.name}.png`}>
                <button style={{ ...primaryBtn, fontSize: 13 }}>Download PNG</button>
              </a>
              <button onClick={() => { const w = window.open(''); if (w) { w.document.write(`<img src="${qrDataUrl}" style="width:100%">`); w.print() } }} style={{ ...secondaryBtn, fontSize: 13 }}>Print</button>
            </div>
            <button onClick={() => { setQrModal(null); setQrDataUrl('') }} style={{ marginTop: 16, background: 'none', border: 'none', color: C.textLight, cursor: 'pointer', fontFamily: F.en, fontSize: 13 }}>Close</button>
          </div>
        </div>
      )}

      {/* Bulk Export Modal */}
      {showExport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: 32, maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, margin: '0 0 20px', fontFamily: F.en }}>Export QR Codes as PDF</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Floor Filter</label>
              <select value={exportFloor} onChange={e => setExportFloor(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: F.en, color: C.textDark }}>
                <option value="all">All Floors</option>
                {uniqueFloors.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 8, fontFamily: F.en }}>Layout (per A4 page)</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {([2, 4, 6] as const).map(n => (
                  <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, fontFamily: F.en, color: C.textDark }}>
                    <input type="radio" checked={exportLayout === n} onChange={() => setExportLayout(n)} />
                    {n} per page
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleExportPdf} disabled={exporting} style={{ ...primaryBtn, flex: 1 }}>
                {exporting ? 'Generating...' : 'Generate PDF'}
              </button>
              <button onClick={() => setShowExport(false)} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "web/src/app/dashboard/sites/[id]/spaces/page.tsx"
git commit -m "feat: spaces list page with floor grouping, QR modal, bulk export modal"
```

---

### Task 9: Add/Edit space forms

**Files:**
- Create: `web/src/app/dashboard/sites/[id]/spaces/new/page.tsx`
- Create: `web/src/app/dashboard/sites/[id]/spaces/[sid]/edit/page.tsx`

- [ ] **Step 1: Create Add Space form**

```typescript
'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { C, F, pageStyle, primaryBtn, secondaryBtn, inputStyle } from '@/lib/brand'

export default function NewSpacePage({ params }: { params: { id: string } }) {
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [floor, setFloor] = useState('')
  const [description, setDescription] = useState('')
  const [floors, setFloors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function loadFloors() {
      const { data } = await supabase.from('spaces').select('floor').eq('site_id', params.id)
      if (data) setFloors([...new Set(data.map((s: { floor: string }) => s.floor))])
    }
    loadFloors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setError('Profile not found'); setLoading(false); return }

    const { error: err } = await supabase.from('spaces').insert({
      organisation_id: profile.organisation_id,
      site_id: params.id,
      name, name_ar: nameAr || null, floor, description: description || null,
    })
    if (err) { setError(err.message); setLoading(false); return }
    router.push(`/dashboard/sites/${params.id}/spaces`)
  }

  return (
    <div style={{ ...pageStyle, maxWidth: 560 }}>
      <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 8px' }}>
        <Link href={`/dashboard/sites/${params.id}/spaces`} style={{ color: C.blue, textDecoration: 'none' }}>← Spaces</Link>
      </p>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 24px' }}>Add Space</h1>
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 16, padding: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Name (EN) *</label>
            <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} placeholder="e.g. Room 101" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Name (AR)</label>
            <input value={nameAr} onChange={e => setNameAr(e.target.value)} style={{ ...inputStyle, direction: 'rtl', fontFamily: F.ar }} placeholder="الاسم بالعربية" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Floor *</label>
            <input value={floor} onChange={e => setFloor(e.target.value)} required list="floors-list" style={inputStyle} placeholder="e.g. Ground Floor" />
            <datalist id="floors-list">{floors.map(f => <option key={f} value={f} />)}</datalist>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' as const }} placeholder="Optional description..." />
          </div>
          {error && <p style={{ color: C.danger, fontSize: 13, fontFamily: F.en, margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={loading} style={primaryBtn}>{loading ? 'Saving...' : 'Add Space'}</button>
            <Link href={`/dashboard/sites/${params.id}/spaces`}><button type="button" style={secondaryBtn}>Cancel</button></Link>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create Edit Space form**

```typescript
'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { C, F, pageStyle, primaryBtn, secondaryBtn, inputStyle } from '@/lib/brand'

export default function EditSpacePage({ params }: { params: { id: string; sid: string } }) {
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [floor, setFloor] = useState('')
  const [description, setDescription] = useState('')
  const [floors, setFloors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('spaces').select('*').eq('id', params.sid).single()
      if (data) { setName(data.name); setNameAr(data.name_ar || ''); setFloor(data.floor); setDescription(data.description || '') }
      const { data: fl } = await supabase.from('spaces').select('floor').eq('site_id', params.id)
      if (fl) setFloors([...new Set(fl.map((s: { floor: string }) => s.floor))])
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sid])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase.from('spaces').update({
      name, name_ar: nameAr || null, floor, description: description || null,
    }).eq('id', params.sid)
    if (err) { setError(err.message); setLoading(false); return }
    router.push(`/dashboard/sites/${params.id}/spaces`)
  }

  return (
    <div style={{ ...pageStyle, maxWidth: 560 }}>
      <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 8px' }}>
        <Link href={`/dashboard/sites/${params.id}/spaces`} style={{ color: C.blue, textDecoration: 'none' }}>← Spaces</Link>
      </p>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 24px' }}>Edit Space</h1>
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 16, padding: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Name (EN) *</label>
            <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Name (AR)</label>
            <input value={nameAr} onChange={e => setNameAr(e.target.value)} style={{ ...inputStyle, direction: 'rtl', fontFamily: F.ar }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Floor *</label>
            <input value={floor} onChange={e => setFloor(e.target.value)} required list="floors-list-edit" style={inputStyle} />
            <datalist id="floors-list-edit">{floors.map(f => <option key={f} value={f} />)}</datalist>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' as const }} />
          </div>
          {error && <p style={{ color: C.danger, fontSize: 13, fontFamily: F.en, margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={loading} style={primaryBtn}>{loading ? 'Saving...' : 'Save Changes'}</button>
            <Link href={`/dashboard/sites/${params.id}/spaces`}><button type="button" style={secondaryBtn}>Cancel</button></Link>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "web/src/app/dashboard/sites/[id]/spaces/new/page.tsx" "web/src/app/dashboard/sites/[id]/spaces/[sid]/edit/page.tsx"
git commit -m "feat: add/edit space forms"
```

---

### Task 10: QR PDF export API

**Files:**
- Create: `web/src/app/api/spaces/export-qr/route.ts`

- [ ] **Step 1: Create the PDF export API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { renderToBuffer, Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'

const styles = StyleSheet.create({
  page: { padding: 24, backgroundColor: '#fff' },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  grid4: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  grid6: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card2: { width: '46%', border: '1pt solid #E2E8F0', borderRadius: 8, padding: 16, alignItems: 'center' },
  card4: { width: '22%', border: '1pt solid #E2E8F0', borderRadius: 6, padding: 10, alignItems: 'center' },
  card6: { width: '14%', border: '1pt solid #E2E8F0', borderRadius: 4, padding: 6, alignItems: 'center' },
  qr2: { width: 140, height: 140, marginBottom: 8 },
  qr4: { width: 90, height: 90, marginBottom: 6 },
  qr6: { width: 60, height: 60, marginBottom: 4 },
  name2: { fontSize: 13, fontWeight: 'bold', color: '#0F2044', textAlign: 'center', marginBottom: 2 },
  name4: { fontSize: 9, fontWeight: 'bold', color: '#0F2044', textAlign: 'center', marginBottom: 1 },
  name6: { fontSize: 7, fontWeight: 'bold', color: '#0F2044', textAlign: 'center', marginBottom: 1 },
  sub2: { fontSize: 10, color: '#64748B', textAlign: 'center' },
  sub4: { fontSize: 7, color: '#64748B', textAlign: 'center' },
  sub6: { fontSize: 6, color: '#64748B', textAlign: 'center' },
})

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { spaceIds, layout, siteName } = await req.json() as { spaceIds: string[]; layout: 2|4|6; siteName: string }

  const { data: spaces } = await supabase
    .from('spaces')
    .select('id, name, floor, qr_token')
    .in('id', spaceIds)

  if (!spaces?.length) {
    return NextResponse.json({ error: 'No spaces found' }, { status: 400 })
  }

  const qrImages: { name: string; floor: string; dataUrl: string }[] = []
  for (const space of spaces) {
    const url = `${APP_URL}/r/${space.qr_token}`
    const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 })
    qrImages.push({ name: space.name, floor: space.floor, dataUrl })
  }

  const gridStyle = layout === 2 ? styles.grid2 : layout === 4 ? styles.grid4 : styles.grid6
  const cardStyle = layout === 2 ? styles.card2 : layout === 4 ? styles.card4 : styles.card6
  const qrStyle = layout === 2 ? styles.qr2 : layout === 4 ? styles.qr4 : styles.qr6
  const nameStyle = layout === 2 ? styles.name2 : layout === 4 ? styles.name4 : styles.name6
  const subStyle = layout === 2 ? styles.sub2 : layout === 4 ? styles.sub4 : styles.sub6

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={gridStyle}>
          {qrImages.map((item, i) => (
            <View key={i} style={cardStyle}>
              <Image src={item.dataUrl} style={qrStyle} />
              <Text style={nameStyle}>{item.name}</Text>
              <Text style={subStyle}>{item.floor}</Text>
              <Text style={subStyle}>{siteName}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )

  const buffer = await renderToBuffer(doc)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="qr-codes.pdf"`,
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/api/spaces/export-qr/route.ts
git commit -m "feat: QR PDF export API with 2/4/6 per page layout"
```

---

### Task 11: Add Spaces button to Sites page

**Files:**
- Modify: `web/src/app/dashboard/sites/page.tsx`

- [ ] **Step 1: Add Spaces button to each site card**

In `web/src/app/dashboard/sites/page.tsx`, find the button group div (line ~92-100) and add a Spaces button:

```typescript
// Replace the button group section (the <div style={{ display: 'flex', gap: 8 }}> block):
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
  <Link href={`/dashboard/sites/${site.id}/spaces`}>
    <button style={{ ...secondaryBtn, padding: '5px 12px', fontSize: 12 }}>Spaces</button>
  </Link>
  <Link href={'/dashboard/sites/' + site.id + '/edit'}>
    <button style={{ ...secondaryBtn, padding: '5px 12px', fontSize: 12 }}>{t('common.edit')}</button>
  </Link>
  <button onClick={() => toggleActive(site.id, site.is_active)} style={{ ...secondaryBtn, padding: '5px 12px', fontSize: 12 }}>
    {site.is_active ? (lang === 'ar' ? 'إيقاف' : 'Deactivate') : (lang === 'ar' ? 'تفعيل' : 'Activate')}
  </button>
  <button onClick={() => deleteSite(site.id)} style={{ ...dangerBtn, padding: '5px 12px', fontSize: 12 }}>{t('common.delete')}</button>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/dashboard/sites/page.tsx
git commit -m "feat: add Spaces button to site cards"
```

---

### Task 12: Requests dashboard list

**Files:**
- Create: `web/src/app/dashboard/requests/page.tsx`

- [ ] **Step 1: Create requests list page**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { format } from 'date-fns'
import { C, F, pageStyle } from '@/lib/brand'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:  { bg: '#FEF9C3', color: '#854D0E' },
  approved: { bg: '#DCFCE7', color: '#166534' },
  rejected: { bg: '#FEE2E2', color: '#991B1B' },
}

export default function RequestsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all'|'pending'|'approved'|'rejected'>('all')
  const supabase = createClient()

  useEffect(() => { fetchRequests() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRequests() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data } = await supabase
      .from('requests')
      .select('*, site:site_id(name), space:space_id(name, floor), work_order:work_order_id(wo_number)')
      .eq('organisation_id', profile.organisation_id)
      .order('status')
      .order('created_at', { ascending: false })
    if (data) setRequests(data)
    setLoading(false)
  }

  const filtered = tab === 'all' ? requests : requests.filter(r => r.status === tab)
  const pendingCount = requests.filter(r => r.status === 'pending').length

  const thStyle: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: F.en, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
  const tdStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: C.textMid, fontFamily: F.en, borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle' }

  return (
    <div style={{ ...pageStyle, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>Requests</h1>
            {pendingCount > 0 && (
              <span style={{ background: '#FEF9C3', color: '#854D0E', fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999, fontFamily: F.en }}>
                {pendingCount} pending
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>Occupant maintenance requests</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {(['all','pending','approved','rejected'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t ? 600 : 400,
            color: tab === t ? C.navy : C.textLight, fontFamily: F.en,
            borderBottom: tab === t ? `2px solid ${C.navy}` : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.textLight, fontFamily: F.en }}>
          <p style={{ fontSize: 18 }}>No {tab === 'all' ? '' : tab} requests</p>
        </div>
      ) : (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Requester','Site','Space','Category','Submitted','Status',''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(req => (
                <tr key={req.id} style={{ background: req.status === 'pending' ? '#FFFBEB' : C.white }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: C.textDark }}>{req.requester_name}</div>
                    <div style={{ fontSize: 12, color: C.textLight }}>{req.requester_email}</div>
                    <div style={{ fontSize: 12, color: C.textMid, marginTop: 1 }}>{req.title}</div>
                  </td>
                  <td style={tdStyle}>{req.site?.name || '—'}</td>
                  <td style={tdStyle}>{req.space ? `${req.space.name} (${req.space.floor})` : '—'}</td>
                  <td style={tdStyle}>{req.category}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{format(new Date(req.created_at), 'dd MMM yyyy')}</td>
                  <td style={tdStyle}>
                    <span style={{ ...STATUS_COLORS[req.status], padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                      {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </span>
                    {req.work_order?.wo_number && (
                      <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>
                        WO-{String(req.work_order.wo_number).padStart(4, '0')}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                    <Link href={`/dashboard/requests/${req.id}`} style={{ color: C.blue, fontWeight: 600, textDecoration: 'none', fontSize: 12 }}>
                      Review →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/dashboard/requests/page.tsx
git commit -m "feat: requests dashboard list with tabs and pending badge"
```

---

### Task 13: Request detail + approve/reject

**Files:**
- Create: `web/src/app/dashboard/requests/[id]/page.tsx`
- Create: `web/src/app/api/requests/[id]/approve/route.ts`
- Create: `web/src/app/api/requests/[id]/reject/route.ts`

- [ ] **Step 1: Create approve API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRequestApproved } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const authHeader = req.headers.get('authorization')
  const { data: { user } } = await supabase.auth.getUser(authHeader?.replace('Bearer ', '') || '')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { priority, assigned_to, due_date } = body

  const { data: request } = await supabase
    .from('requests')
    .select('*, site:site_id(name, organisation_id), space:space_id(id)')
    .eq('id', params.id)
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const { data: wo, error: woErr } = await supabase
    .from('work_orders')
    .insert({
      organisation_id: request.organisation_id,
      site_id: request.site_id,
      space_id: request.space_id,
      request_id: request.id,
      title: request.title,
      description: request.description,
      category: request.category,
      priority: priority || 'medium',
      status: 'open',
      assigned_to: assigned_to || null,
      due_date: due_date || null,
    })
    .select()
    .single()

  if (woErr) return NextResponse.json({ error: woErr.message }, { status: 500 })

  await supabase.from('requests').update({
    status: 'approved',
    work_order_id: wo.id,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${request.tracking_token}`
  const woNum = `WO-${String(wo.wo_number).padStart(4, '0')}`

  try {
    await sendRequestApproved({
      to: request.requester_email,
      name: request.requester_name,
      siteName: request.site.name,
      woNumber: woNum,
      trackingUrl,
    })
  } catch { /* email failure non-blocking */ }

  return NextResponse.json({ success: true, wo_id: wo.id, wo_number: woNum })
}
```

- [ ] **Step 2: Create reject API route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendRequestRejected } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const authHeader = req.headers.get('authorization')
  const { data: { user } } = await supabase.auth.getUser(authHeader?.replace('Bearer ', '') || '')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reason } = await req.json()

  const { data: request } = await supabase
    .from('requests')
    .select('*, site:site_id(name)')
    .eq('id', params.id)
    .single()

  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  await supabase.from('requests').update({
    status: 'rejected',
    rejection_reason: reason || null,
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${request.tracking_token}`

  try {
    await sendRequestRejected({
      to: request.requester_email,
      name: request.requester_name,
      siteName: request.site.name,
      reason,
      trackingUrl,
    })
  } catch { /* email failure non-blocking */ }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Create request detail page**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { C, F, pageStyle, primaryBtn, secondaryBtn, dangerBtn, inputStyle } from '@/lib/brand'

const PRIORITIES = ['low','medium','high','critical']

export default function RequestDetailPage({ params }: { params: { id: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [request, setRequest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showApprove, setShowApprove] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { fetchRequest() }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRequest() {
    setLoading(true)
    const { data } = await supabase
      .from('requests')
      .select('*, site:site_id(name), space:space_id(name, floor), work_order:work_order_id(wo_number, status, id)')
      .eq('id', params.id)
      .single()
    if (data) setRequest(data)
    setLoading(false)
  }

  async function handleApprove() {
    setActing(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/requests/${params.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ priority, due_date: dueDate || null }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error); setActing(false); return }
    setShowApprove(false)
    fetchRequest()
    setActing(false)
  }

  async function handleReject() {
    setActing(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/requests/${params.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ reason: rejectReason }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error); setActing(false); return }
    setShowReject(false)
    fetchRequest()
    setActing(false)
  }

  if (loading) return <div style={{ ...pageStyle }}><p style={{ color: C.textLight, fontFamily: F.en }}>Loading...</p></div>
  if (!request) return <div style={{ ...pageStyle }}><p style={{ color: C.danger, fontFamily: F.en }}>Request not found.</p></div>

  const woNum = request.work_order?.wo_number
    ? `WO-${String(request.work_order.wo_number).padStart(4, '0')}`
    : null

  return (
    <div style={{ ...pageStyle, maxWidth: 900 }}>
      <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 12px' }}>
        <Link href="/dashboard/requests" style={{ color: C.blue, textDecoration: 'none' }}>← Requests</Link>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
        {/* Left: details */}
        <div>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: C.navy, margin: '0 0 4px', fontFamily: F.en }}>{request.title}</h1>
                <p style={{ fontSize: 13, color: C.textLight, margin: 0, fontFamily: F.en }}>
                  {request.category} · Submitted {format(new Date(request.created_at), 'dd MMM yyyy')}
                </p>
              </div>
              <span style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: request.status === 'pending' ? '#FEF9C3' : request.status === 'approved' ? '#DCFCE7' : '#FEE2E2',
                color: request.status === 'pending' ? '#854D0E' : request.status === 'approved' ? '#166534' : '#991B1B',
                fontFamily: F.en,
              }}>
                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {[
                ['Requester', request.requester_name],
                ['Email', request.requester_email],
                ['Phone', request.requester_phone || '—'],
                ['Site', request.site?.name || '—'],
                ['Space', request.space ? `${request.space.name} (${request.space.floor})` : '—'],
              ].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 2, fontFamily: F.en }}>{label}</div>
                  <div style={{ fontSize: 14, color: C.textDark, fontFamily: F.en }}>{val}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6, fontFamily: F.en }}>Description</div>
              <p style={{ fontSize: 14, color: C.textMid, lineHeight: 1.7, margin: 0, fontFamily: F.en }}>{request.description}</p>
            </div>

            {request.rejection_reason && (
              <div style={{ marginTop: 16, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.danger, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4, fontFamily: F.en }}>Rejection Reason</div>
                <p style={{ fontSize: 13, color: C.textDark, margin: 0, fontFamily: F.en }}>{request.rejection_reason}</p>
              </div>
            )}

            {woNum && (
              <div style={{ marginTop: 16, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.success, textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4, fontFamily: F.en }}>Work Order Created</div>
                <Link href={`/dashboard/work-orders/${request.work_order.id}`} style={{ fontSize: 14, fontWeight: 600, color: C.blue, fontFamily: F.en }}>{woNum} →</Link>
              </div>
            )}
          </div>

          {/* Photos */}
          {request.photo_urls?.length > 0 && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, fontFamily: F.en }}>Photos</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                {request.photo_urls.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt={`Photo ${i+1}`} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* File attachments */}
          {request.file_urls?.length > 0 && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, fontFamily: F.en }}>Files</div>
              {request.file_urls.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: 'block', color: C.blue, fontFamily: F.en, fontSize: 13, marginBottom: 4 }}>
                  📎 Attachment {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Right: actions */}
        <div>
          {request.status === 'pending' && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, fontFamily: F.en }}>Actions</div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
                <button onClick={() => setShowApprove(true)} style={{ ...primaryBtn, width: '100%' }}>
                  Approve → Create Work Order
                </button>
                <button onClick={() => setShowReject(true)} style={{ ...dangerBtn, width: '100%' }}>
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Approve modal */}
      {showApprove && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, margin: '0 0 4px', fontFamily: F.en }}>Approve Request</h3>
            <p style={{ fontSize: 13, color: C.textLight, margin: '0 0 20px', fontFamily: F.en }}>A work order will be created. Title, description, category, site and space are pre-filled.</p>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle }}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Due Date (optional)</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
            {error && <p style={{ color: C.danger, fontSize: 13, margin: '12px 0 0', fontFamily: F.en }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleApprove} disabled={acting} style={{ ...primaryBtn, flex: 1 }}>{acting ? 'Creating...' : 'Confirm & Create WO'}</button>
              <button onClick={() => setShowApprove(false)} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showReject && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, margin: '0 0 20px', fontFamily: F.en }}>Reject Request</h3>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Reason (optional)</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' as const }} placeholder="Explain why this request is being rejected..." />
            </div>
            {error && <p style={{ color: C.danger, fontSize: 13, margin: '12px 0 0', fontFamily: F.en }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleReject} disabled={acting} style={{ ...dangerBtn, flex: 1 }}>{acting ? 'Rejecting...' : 'Reject Request'}</button>
              <button onClick={() => setShowReject(false)} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add "web/src/app/dashboard/requests/[id]/page.tsx" \
        "web/src/app/api/requests/[id]/approve/route.ts" \
        "web/src/app/api/requests/[id]/reject/route.ts"
git commit -m "feat: request detail page with approve/reject modals and API routes"
```

---

### Task 14: Update Sidebar — add Requests nav item

**Files:**
- Modify: `web/src/components/Sidebar.tsx`

- [ ] **Step 1: Add requests icon to ICONS map**

In `Sidebar.tsx`, add after the `invoices` entry in `ICONS`:
```typescript
requests: <SvgIcon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
```

- [ ] **Step 2: Add requests nav item to NAV array**

In the `NAV` array, add after `work_orders` entry:
```typescript
{ key: 'requests', href: '/dashboard/requests', en: 'Requests', ar: 'الطلبات', exact: false },
```

- [ ] **Step 3: Add reqBadge state and query**

Add after `const [woBadge, setWoBadge] = useState(0)`:
```typescript
const [reqBadge, setReqBadge] = useState(0)
```

Inside `loadUser`, after the `setWoBadge` block, add:
```typescript
const { count: rCount } = await supabase
  .from('requests')
  .select('*', { count: 'exact', head: true })
  .eq('organisation_id', profile.organisation_id)
  .eq('status', 'pending')
if (rCount) setReqBadge(rCount)
```

- [ ] **Step 4: Add badge rendering for requests**

In the NAV `.map()` render, after the `const isWO = item.key === 'work_orders'` line, add:
```typescript
const isReq = item.key === 'requests'
```

Then after the WO badge collapsed dot block, add:
```typescript
{/* Requests badge — expanded */}
{!collapsed && isReq && reqBadge > 0 && (
  <span style={{
    background: isActive ? 'rgba(255,255,255,0.2)' : '#DC2626' + '1A',
    color: isActive ? '#fff' : '#DC2626',
    fontSize: 11, fontWeight: 700,
    padding: '1px 6px', borderRadius: 999,
    minWidth: 20, textAlign: 'center', flexShrink: 0,
  }}>
    {reqBadge > 99 ? '99+' : reqBadge}
  </span>
)}

{/* Requests badge — collapsed dot */}
{collapsed && isReq && reqBadge > 0 && (
  <span style={{
    position: 'absolute', top: 5, right: 8,
    width: 7, height: 7, borderRadius: '50%',
    background: '#DC2626',
  }} />
)}
```

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Sidebar.tsx
git commit -m "feat: add Requests nav item with pending badge to sidebar"
```

---

### Task 15: Update WorkOrder type

**Files:**
- Modify: `web/src/types/work-order.ts`

- [ ] **Step 1: Add request_id and space_id fields**

In `web/src/types/work-order.ts`, after the `wo_number` field, add:
```typescript
request_id: string | null
space_id: string | null
```

- [ ] **Step 2: Commit**

```bash
git add web/src/types/work-order.ts
git commit -m "feat: add request_id and space_id to WorkOrder type"
```

---

### Task 16: Space Assets tab in WO detail + email hook

**Files:**
- Modify: `web/src/app/dashboard/work-orders/[id]/page.tsx`

This task has two parts: (a) hook requester emails into `doStatusUpdate`, and (b) add a "Space Assets" tab when the WO has a `space_id`.

- [ ] **Step 1: Add email hook to doStatusUpdate**

Find `doStatusUpdate` in the WO detail page. Add this block just before the `router.refresh()` or `fetchWO()` call at the end:

```typescript
// Send requester email if WO has a linked request
if (wo.request_id && ['in_progress','completed','finished'].includes(newStatus)) {
  try {
    const { data: req } = await supabase
      .from('requests')
      .select('requester_name, requester_email, tracking_token, site:site_id(name)')
      .eq('id', wo.request_id)
      .single()
    if (req) {
      await fetch('/api/requests/notify-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_name: req.requester_name,
          requester_email: req.requester_email,
          site_name: (req.site as { name: string }).name,
          tracking_token: req.tracking_token,
          status: newStatus,
        }),
      })
    }
  } catch { /* non-blocking */ }
}
```

- [ ] **Step 2: Create the notify-status API route**

Create `web/src/app/api/requests/notify-status/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { sendWOStatusUpdate } from '@/lib/email'

export async function POST(req: NextRequest) {
  const { requester_name, requester_email, site_name, tracking_token, status } = await req.json()
  const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/track/${tracking_token}`
  try {
    await sendWOStatusUpdate({ to: requester_email, name: requester_name, siteName: site_name, status, trackingUrl })
  } catch { /* non-blocking */ }
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Add Space Assets tab**

In the WO detail page tabs array, add:
```typescript
...(wo.space_id ? [{ key: 'space_assets', label: 'Space Assets' }] : []),
```

Add a tab panel for `activeTab === 'space_assets'` that loads and lists assets for `wo.space_id` with Commission/Decommission buttons and confirmation dialogs:

```typescript
{activeTab === 'space_assets' && wo.space_id && (
  <SpaceAssetsTab spaceId={wo.space_id} woId={wo.id} />
)}
```

Create an inline `SpaceAssetsTab` component within the same file:

```typescript
function SpaceAssetsTab({ spaceId, woId }: { spaceId: string; woId: string }) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assets, setAssets] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [space, setSpace] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data: sp } = await supabase.from('spaces').select('name, floor').eq('id', spaceId).single()
      if (sp) setSpace(sp)
      const { data } = await supabase.from('assets').select('*').eq('space_id', spaceId)
      if (data) setAssets(data)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId])

  async function changeStatus(assetId: string, assetName: string, newStatus: 'online' | 'offline') {
    const label = newStatus === 'online' ? 'commission' : 'decommission'
    if (!confirm(`Mark "${assetName}" as ${newStatus}?`)) return
    await supabase.from('assets').update({ status: newStatus }).eq('id', assetId)
    await supabase.from('work_order_activities').insert({
      work_order_id: woId,
      description: `${label.charAt(0).toUpperCase() + label.slice(1)}ed asset: ${assetName}`,
    })
    const { data } = await supabase.from('assets').select('*').eq('space_id', spaceId)
    if (data) setAssets(data)
  }

  const thS: React.CSSProperties = { padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}`, fontFamily: F.en }
  const tdS: React.CSSProperties = { padding: '11px 14px', fontSize: 13, color: C.textMid, borderBottom: `1px solid ${C.border}`, fontFamily: F.en }

  return (
    <div>
      {space && (
        <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, marginBottom: 16 }}>
          {space.name} · {space.floor}
        </p>
      )}
      {assets.length === 0 ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>No assets assigned to this space.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Name','Category','Status',''].map(h => <th key={h} style={thS}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {assets.map(asset => (
              <tr key={asset.id}>
                <td style={tdS}>{asset.name}</td>
                <td style={tdS}>{asset.category}</td>
                <td style={tdS}>
                  <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: asset.status === 'online' ? '#DCFCE7' : C.pageBg, color: asset.status === 'online' ? '#166534' : C.textMid }}>
                    {asset.status === 'online' ? 'Online' : 'Offline'}
                  </span>
                </td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                  <button onClick={() => changeStatus(asset.id, asset.name, 'online')} disabled={asset.status === 'online'} style={{ fontSize: 12, padding: '4px 10px', marginRight: 6, border: `1px solid ${C.border}`, borderRadius: 6, cursor: asset.status === 'online' ? 'not-allowed' : 'pointer', background: C.white, color: asset.status === 'online' ? C.textLight : C.success, fontFamily: F.en }}>
                    Commission
                  </button>
                  <button onClick={() => changeStatus(asset.id, asset.name, 'offline')} disabled={asset.status === 'offline'} style={{ fontSize: 12, padding: '4px 10px', border: `1px solid ${C.border}`, borderRadius: 6, cursor: asset.status === 'offline' ? 'not-allowed' : 'pointer', background: C.white, color: asset.status === 'offline' ? C.textLight : C.danger, fontFamily: F.en }}>
                    Decommission
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/app/dashboard/work-orders/[id]/page.tsx web/src/app/api/requests/notify-status/route.ts
git commit -m "feat: Space Assets tab in WO detail + requester email on status change"
```

---

### Task 17: Update WorkOrder type for new fields (used by Space Assets tab)

**Files:**
- Modify: `web/src/types/work-order.ts`

(If not already done in Task 15, confirm `request_id` and `space_id` are in the type.)

---

### Task 18: Build check & final commit

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: no errors. If errors, fix them before proceeding.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: exit 0, no type errors, all routes compile.

- [ ] **Step 3: Update CONTEXT.md Sprint B checkboxes**

In `CONTEXT.md`, find Sprint B task list and mark all items as `[x]`.

- [ ] **Step 4: Final commit**

```bash
git add CONTEXT.md
git commit -m "chore: mark Sprint B complete in CONTEXT.md"
```

---

## Execution Notes

- **Supabase SQL** — Tasks 2 steps must be run manually in the Supabase Dashboard SQL Editor (no migration files in this project).
- **env vars** — `SUPABASE_SERVICE_ROLE_KEY` is needed by API routes that use the service role client. Add it to `web/.env.local` if not already present.
- **`(public)` route group** — the parentheses in the folder name must be escaped in bash: `git add "web/src/app/(public)/..."`.
- **QR import** — `qrcode` is a CommonJS package; use `import QRCode from 'qrcode'` with `@types/qrcode` installed.
- **`@react-pdf/renderer`** — already installed per spec. The PDF export route must be a server-side route (no `'use client'`).
