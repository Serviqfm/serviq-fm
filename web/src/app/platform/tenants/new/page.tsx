'use client'
import { useState } from 'react'
import Link from 'next/link'

type CreateResult = { org_id: string; admin_email: string; temp_password: string }

export default function NewTenantPage() {
  const [form, setForm] = useState({ org_name: '', plan: 'free', admin_email: '', admin_full_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CreateResult | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/platform/tenants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    setResult(data)
  }

  if (result) {
    return (
      <div className="star-pattern bg-surface min-h-screen p-8">
        <div className="max-w-xl space-y-4">
          <h1 className="text-2xl font-bold text-on-surface">Tenant Created</h1>
          <div className="bg-primary/5 border border-primary/20 rounded-[12px] p-5">
            <p className="text-sm text-on-surface mb-4">
              <strong>{form.org_name}</strong> is ready. Share these credentials with the
              admin once — the password will not be shown again.
            </p>
            <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-4 font-mono text-sm space-y-2">
              <div><span className="text-on-surface-variant">Login URL: </span>https://serviqfm.com/login/employee</div>
              <div><span className="text-on-surface-variant">Email: </span>{result.admin_email}</div>
              <div><span className="text-on-surface-variant">Temp password: </span><span className="font-bold text-primary">{result.temp_password}</span></div>
            </div>
            <p className="text-xs text-on-surface-variant mt-3">
              A welcome email with these details was also sent to {result.admin_email}.
              The admin should change the password immediately after first login.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href={`/platform/tenants/${result.org_id}`}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm">
              Open tenant detail
            </Link>
            <Link href="/platform/tenants"
              className="border border-outline-variant text-on-surface-variant px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-surface-container-low transition-colors">
              Back to tenants
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-6">Create Tenant</h1>
      <form onSubmit={submit} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 max-w-xl space-y-4">
        <Field label="Organisation name" value={form.org_name} onChange={v => setForm(f => ({ ...f, org_name: v }))} required />
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Plan</label>
          <select value={form.plan} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm">
            {['free', 'starter', 'pro', 'enterprise'].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <Field label="First admin email" value={form.admin_email} onChange={v => setForm(f => ({ ...f, admin_email: v }))} required type="email" />
        <Field label="First admin full name" value={form.admin_full_name} onChange={v => setForm(f => ({ ...f, admin_full_name: v }))} required />
        {error && <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm">{error}</div>}
        <button type="submit" disabled={loading}
          className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
          {loading ? 'Creating…' : 'Create tenant'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, required, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">{label}{required && <span className="text-error"> *</span>}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm" />
    </div>
  )
}
