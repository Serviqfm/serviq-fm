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
  const [all, setAll] = useState<TenantRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ include_offboarded: '1' })
    if (search) params.set('q', search)
    fetch(`/api/platform/tenants?${params}`)
      .then(r => r.json())
      .then(d => { setAll(d.tenants ?? []); setLoading(false) })
  }, [search])

  const active = all.filter(t => !t.offboarded_at)
  const offboarded = all.filter(t => !!t.offboarded_at)

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

      {/* Active tenants */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden mb-8">
        <div className="px-4 py-3 border-b border-outline-variant/40 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-on-surface">Active tenants</div>
            <div className="text-xs text-on-surface-variant mt-0.5">{active.length} live organisation{active.length === 1 ? '' : 's'}</div>
          </div>
        </div>
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
            ) : active.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-on-surface-variant text-center">No active tenants yet. Click <strong>+ Create tenant</strong> to onboard the first one.</td></tr>
            ) : active.map(t => {
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

      {/* Offboarded — history log */}
      {!loading && offboarded.length > 0 && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant/40 flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-on-surface">Offboarded — history log</div>
              <div className="text-xs text-on-surface-variant mt-0.5">{offboarded.length} organisation{offboarded.length === 1 ? '' : 's'} archived for the record. User accounts and tenant data have been deleted; the org row is kept so export downloads remain valid.</div>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low">
              <tr className="text-left text-[11px] uppercase tracking-wider text-on-surface-variant">
                <th className="px-4 py-3">Name</th>
                <th>Plan (last)</th><th>MRR (last)</th><th>Offboarded</th><th></th>
              </tr>
            </thead>
            <tbody>
              {offboarded.map(t => (
                <tr key={t.id} className="border-t border-outline-variant/40 hover:bg-surface-container-low/40 opacity-75">
                  <td className="px-4 py-3 text-on-surface-variant font-medium">
                    {t.name}
                    <span className="ml-2 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-error/10 text-error border border-error/20">Offboarded</span>
                  </td>
                  <td className="text-on-surface-variant">{t.plan}</td>
                  <td className="text-on-surface-variant">{formatSAR(t.mrr_cents)}</td>
                  <td className="text-on-surface-variant">{t.offboarded_at ? new Date(t.offboarded_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</td>
                  <td className="text-end px-4">
                    <Link href={`/platform/tenants/${t.id}`} className="text-secondary font-semibold text-xs">View record →</Link>
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
