'use client'

import { useEffect, useState } from 'react'
import { formatSAR, parseSARToCents } from '@/lib/currency'

type BillingData = {
  plan: string
  billing_status: string
  mrr_cents: number
  renews_at: string | null
  contract_notes: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export default function BillingForm({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<BillingData | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/platform/tenants/${tenantId}/billing`)
      .then(r => r.json())
      .then(d => setData(d.billing))
  }, [tenantId])

  if (!data) return <div className="text-on-surface-variant">Loading…</div>

  async function save() {
    if (!data) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/platform/tenants/${tenantId}/billing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: 'Unknown error' }))
      setError(j.error ?? 'Save failed')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 max-w-2xl space-y-4">
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Plan</label>
        <select
          value={data.plan}
          onChange={e => setData(d => d && { ...d, plan: e.target.value })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        >
          {['free', 'starter', 'pro', 'enterprise'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Billing status</label>
        <select
          value={data.billing_status}
          onChange={e => setData(d => d && { ...d, billing_status: e.target.value })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        >
          {['paid', 'failed', 'overdue'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">MRR (SAR)</label>
        <input
          type="text"
          value={(data.mrr_cents / 100).toFixed(2)}
          onChange={e => setData(d => d && { ...d, mrr_cents: parseSARToCents(e.target.value) })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        />
        <div className="text-[11px] text-on-surface-variant mt-1">
          Stored: {data.mrr_cents} cents · Display: {formatSAR(data.mrr_cents)}
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Renews on</label>
        <input
          type="date"
          value={data.renews_at ?? ''}
          onChange={e => setData(d => d && { ...d, renews_at: e.target.value || null })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Contract notes</label>
        <textarea
          value={data.contract_notes ?? ''}
          onChange={e => setData(d => d && { ...d, contract_notes: e.target.value || null })}
          rows={4}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div className="text-[11px] text-on-surface-variant border-t border-outline-variant pt-3">
        Stripe Customer ID: <span className="font-mono">{data.stripe_customer_id ?? 'Not connected'}</span>
        <br />
        Stripe Subscription ID: <span className="font-mono">{data.stripe_subscription_id ?? 'Not connected'}</span>
      </div>

      {error && (
        <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm">{error}</div>
      )}

      <div className="flex gap-3 items-center">
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-primary text-sm font-semibold">Saved</span>}
      </div>
    </div>
  )
}
