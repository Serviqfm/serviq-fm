'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewTenantPage() {
  const router = useRouter()
  const [form, setForm] = useState({ org_name: '', plan: 'free', admin_email: '', admin_full_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/platform/tenants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return }
    router.push(`/platform/tenants/${data.org_id}`)
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
