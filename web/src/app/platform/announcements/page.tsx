'use client'

import { useEffect, useState } from 'react'

type Announcement = {
  id: string
  title: string
  body: string
  organisation_id: string | null
  published_at: string | null
  active: boolean
  created_at: string
}

type Tenant = { id: string; name: string }

export default function AnnouncementsPage() {
  const [list, setList] = useState<Announcement[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [orgId, setOrgId] = useState('') // '' = all tenants
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function refresh() {
    fetch('/api/platform/announcements').then(r => r.json()).then(d => setList(d.announcements ?? []))
  }

  useEffect(() => {
    refresh()
    fetch('/api/platform/tenants')
      .then(r => r.json())
      .then(d => setTenants((d.tenants ?? []).map((t: Tenant) => ({ id: t.id, name: t.name }))))
  }, [])

  const nameById = (id: string | null) => (id ? tenants.find(t => t.id === id)?.name ?? id : 'All tenants')

  async function submit(publish: boolean) {
    if (!title.trim() || !body.trim()) { setError('Title and body are required'); return }
    setBusy(true); setError('')
    const res = await fetch('/api/platform/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, organisation_id: orgId || null, publish }),
    })
    setBusy(false)
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Failed'); return }
    setTitle(''); setBody(''); setOrgId('')
    refresh()
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-6">Announcements</h1>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 max-w-2xl space-y-3 mb-8">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        />
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Message shown to tenants…"
          rows={4}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        />
        <select
          value={orgId}
          onChange={e => setOrgId(e.target.value)}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        >
          <option value="">All tenants</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {error && <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm">{error}</div>}
        <div className="flex gap-3 pt-1">
          <button onClick={() => submit(true)} disabled={busy}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
            {busy ? 'Saving…' : 'Publish'}
          </button>
          <button onClick={() => submit(false)} disabled={busy}
            className="bg-surface-container-low text-on-surface-variant border border-outline-variant px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
            Save draft
          </button>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden max-w-3xl">
        <div className="px-4 py-3 border-b border-outline-variant/40 text-sm font-bold text-on-surface">Posted</div>
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low">
            <tr className="text-left text-[11px] uppercase tracking-wider text-secondary">
              <th className="px-4 py-3">Title</th><th>Audience</th><th>Status</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-on-surface-variant text-center">No announcements yet.</td></tr>
            ) : list.map(a => (
              <tr key={a.id} className="border-t border-outline-variant/40">
                <td className="px-4 py-3 text-on-surface font-medium">{a.title}</td>
                <td className="text-on-surface-variant">{nameById(a.organisation_id)}</td>
                <td>
                  <span className={a.active && a.published_at
                    ? 'inline-block px-2 py-0.5 rounded-full border text-xs font-semibold bg-primary/10 text-primary border-primary/20'
                    : 'inline-block px-2 py-0.5 rounded-full border text-xs font-semibold bg-surface-container-low text-on-surface-variant border-outline-variant'}>
                    {a.published_at ? (a.active ? 'Published' : 'Inactive') : 'Draft'}
                  </span>
                </td>
                <td className="text-on-surface-variant">{new Date(a.created_at).toLocaleDateString('en-GB')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
