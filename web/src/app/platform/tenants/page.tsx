'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatSAR } from '@/lib/currency'

type TenantRow = {
  id: string
  name: string
  plan: string
  billing_status: string
  mrr_cents: number
  offboarded_at: string | null
  total_score: number
}

function healthBucket(score: number): { label: string; cls: string } {
  if (score >= 80) return { label: 'Healthy', cls: 'bg-primary/10 text-primary border-primary/20' }
  if (score >= 50) return { label: 'At Risk', cls: 'bg-[#f57f17]/10 text-[#f57f17] border-[#f57f17]/20' }
  return { label: 'Churning', cls: 'bg-error/10 text-error border-error/20' }
}

export default function TenantsListPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    fetch(`/api/platform/tenants?${params}`)
      .then(r => r.json())
      .then(d => { setTenants(d.tenants ?? []); setLoading(false) })
  }, [search])

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-on-surface">Tenants</h1>
        <Link href="/platform/tenants/new"
          className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 shadow-sm">
          + Create tenant
        </Link>
      </div>

      <div className="mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full max-w-md bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low">
            <tr className="text-left text-[11px] uppercase tracking-wider text-secondary">
              <th className="px-4 py-3">Name</th>
              <th>Plan</th><th>Health</th><th>MRR</th><th>Billing</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-on-surface-variant">Loading…</td></tr>
            ) : tenants.map(t => {
              const bucket = healthBucket(t.total_score)
              return (
                <tr key={t.id} className="border-t border-outline-variant/40 hover:bg-surface-container-low/40">
                  <td className="px-4 py-3 text-on-surface font-medium">{t.name}</td>
                  <td className="text-on-surface-variant">{t.plan}</td>
                  <td><span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-semibold ${bucket.cls}`}>{bucket.label} ({t.total_score})</span></td>
                  <td className="text-on-surface-variant">{formatSAR(t.mrr_cents)}</td>
                  <td className="text-on-surface-variant">{t.billing_status}</td>
                  <td className="text-end px-4">
                    <Link href={`/platform/tenants/${t.id}`} className="text-primary font-semibold">Open →</Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
