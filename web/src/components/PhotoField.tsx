// A single-photo upload field: pick a file, it goes to /api/upload (which checks
// auth, org and the MIME allowlist server-side) and the parent gets the public
// URL back. Used by the inventory forms so the stock picker has pictures.
'use client'

import { useRef, useState } from 'react'

export function PhotoField({ value, onChange, prefix, label }: {
  value: string
  onChange: (url: string) => void
  /** Storage path under the bucket, e.g. `${orgId}/inventory`. */
  prefix: string
  label: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/upload?bucket=media&prefix=${encodeURIComponent(prefix)}`, {
        method: 'POST', body: fd,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.publicUrl) { setError(body.error || 'Upload failed'); return }
      onChange(body.publicUrl as string)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#444' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 8, border: '1px solid #ddd', background: '#fafafa',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
        }}>
          {value
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 11, color: '#bbb' }}>No photo</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>
          {busy ? 'Uploading…' : value ? 'Replace' : 'Upload photo'}
        </button>
        {value && !busy && (
          <button type="button" onClick={() => onChange('')}
            style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #eee', background: 'white', cursor: 'pointer', fontSize: 13, color: '#b71c1c' }}>
            Remove
          </button>
        )}
      </div>
      {error && <p style={{ color: '#b71c1c', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
    </div>
  )
}
