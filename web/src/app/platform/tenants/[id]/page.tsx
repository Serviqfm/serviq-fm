'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatSAR } from '@/lib/currency'

type TenantUser = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  is_active: boolean | null
  disabled: boolean | null
  last_sign_in_at: string | null
}

type TenantHealth = {
  recency_pts: number
  users_pts: number
  wo_pts: number
  billing_pts: number
  total_score: number
}

type ActivityEntry = {
  id: string
  action: string
  created_at: string
  details: Record<string, unknown> | null
}

type TenantDetail = {
  id: string
  name: string
  plan: string
  billing_status: string
  mrr_cents: number
  renews_at: string | null
  contract_notes: string | null
  offboarded_at: string | null
  offboarded_by: string | null
  health: TenantHealth | null
  users: TenantUser[]
  recent_activity: ActivityEntry[]
}

type Tab = 'overview' | 'users' | 'billing' | 'flags' | 'audit'

export default function TenantDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const [detail, setDetail] = useState<TenantDetail | null>(null)

  function refresh() {
    fetch(`/api/platform/tenants/${id}`)
      .then(r => r.json())
      .then(d => setDetail(d.tenant))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function impersonate() {
    const res = await fetch('/api/impersonation/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: id }),
    })
    if (res.ok) {
      window.location.href = '/dashboard'
    } else {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }))
      alert('Failed: ' + (data.error ?? 'Unknown error'))
    }
  }

  async function reactivate() {
    const res = await fetch(`/api/platform/tenants/${id}/reactivate`, { method: 'POST' })
    if (res.ok) {
      refresh()
    } else {
      const data = await res.json().catch(() => ({ error: 'Unknown error' }))
      alert('Failed: ' + (data.error ?? 'Unknown error'))
    }
  }

  if (!detail) return <div className="p-8 text-on-surface-variant">Loading…</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'users',    label: 'Users' },
    { key: 'billing',  label: 'Billing' },
    { key: 'flags',    label: 'Feature Flags' },
    { key: 'audit',    label: 'Audit' },
  ]

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/platform/tenants" className="text-sm text-on-surface-variant">← All tenants</Link>
          <h1 className="text-2xl font-bold text-on-surface mt-1">{detail.name}</h1>
          {detail.offboarded_at && (
            <span className="inline-block mt-1 bg-error/10 text-error border border-error/20 px-2 py-0.5 rounded-full text-xs font-semibold">
              Offboarded {new Date(detail.offboarded_at).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={impersonate} disabled={!!detail.offboarded_at}
            className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm disabled:opacity-50">
            Login as Admin
          </button>
          {!detail.offboarded_at && (
            <button onClick={() => router.push(`/platform/tenants/${id}/offboard`)}
              className="bg-error/10 text-error border border-error/20 px-4 py-2 rounded-xl font-semibold text-sm">
              Offboard
            </button>
          )}
          {detail.offboarded_at && (
            <button onClick={reactivate}
              className="bg-primary/10 text-primary border border-primary/20 px-4 py-2 rounded-xl font-semibold text-sm">
              Reactivate
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-0 mb-6 border-b border-outline-variant">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={tab === t.key
              ? 'px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary'
              : 'px-4 py-2.5 text-sm text-on-surface-variant border-b-2 border-transparent hover:text-on-surface'}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab detail={detail} />}
      {tab === 'users' && <UsersTab tenantId={id} users={detail.users} onChange={refresh} />}
      {tab === 'billing' && <BillingPlaceholder tenantId={id} />}
      {tab === 'flags' && <FlagsPlaceholder tenantId={id} />}
      {tab === 'audit' && <AuditTab tenantId={id} />}
    </div>
  )
}

function OverviewTab({ detail }: { detail: TenantDetail }) {
  const h = detail.health
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
        <h3 className="text-base font-semibold mb-3">Identity</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-on-surface-variant">Plan</dt><dd>{detail.plan}</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">Billing</dt><dd>{detail.billing_status}</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">MRR</dt><dd>{formatSAR(detail.mrr_cents)}</dd></div>
          <div className="flex justify-between"><dt className="text-on-surface-variant">Renews</dt><dd>{detail.renews_at ?? '—'}</dd></div>
        </dl>
      </div>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
        <h3 className="text-base font-semibold mb-3">Health breakdown</h3>
        {h ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-on-surface-variant">Recency</dt><dd>{h.recency_pts} / 24</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Users</dt><dd>{h.users_pts} / 18</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">WOs (30d)</dt><dd>{h.wo_pts} / 18</dd></div>
            <div className="flex justify-between"><dt className="text-on-surface-variant">Billing</dt><dd>{h.billing_pts} / 40</dd></div>
            <div className="flex justify-between font-semibold border-t pt-2 mt-2"><dt>Total</dt><dd>{h.total_score} / 100</dd></div>
          </dl>
        ) : (
          <div className="text-sm text-on-surface-variant">No health data.</div>
        )}
      </div>
      <div className="col-span-2 bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
        <h3 className="text-base font-semibold mb-3">Recent activity</h3>
        {detail.recent_activity.length === 0 ? (
          <div className="text-sm text-on-surface-variant">No recent activity.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {detail.recent_activity.map(a => (
              <li key={a.id} className="flex justify-between text-on-surface-variant">
                <span>{a.action}</span>
                <span className="text-xs">{new Date(a.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function UsersTab({ tenantId, users, onChange }: { tenantId: string; users: TenantUser[]; onChange: () => void }) {
  async function toggleDisabled(userId: string, currentlyDisabled: boolean) {
    const res = await fetch(`/api/platform/tenants/${tenantId}/users/${userId}/disable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ disabled: !currentlyDisabled }),
    })
    if (res.ok) onChange()
  }
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-container-low text-[11px] uppercase tracking-wider text-secondary">
          <tr><th className="px-4 py-3 text-left">Name</th><th>Email</th><th>Role</th><th>Last login</th><th>Disabled</th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-t border-outline-variant/40">
              <td className="px-4 py-2">{u.full_name ?? '—'}</td>
              <td className="text-on-surface-variant">{u.email ?? '—'}</td>
              <td className="text-on-surface-variant">{u.role ?? '—'}</td>
              <td className="text-on-surface-variant text-xs">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : '—'}</td>
              <td>
                <button onClick={() => toggleDisabled(u.id, !!u.disabled)}
                  className={u.disabled ? 'bg-error text-white px-3 py-1 rounded-full text-xs' : 'bg-surface-container-low text-on-surface-variant px-3 py-1 rounded-full text-xs'}>
                  {u.disabled ? 'Disabled' : 'Enabled'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BillingPlaceholder({ tenantId }: { tenantId: string }) {
  // Agent-Billing replaces this with the actual form component
  return <div className="text-on-surface-variant">Billing form — implemented by Agent-Billing (see /api/platform/tenants/{tenantId}/billing)</div>
}

function FlagsPlaceholder({ tenantId }: { tenantId: string }) {
  // Agent-Flags replaces this with the actual form component
  return <div className="text-on-surface-variant">Flags form — implemented by Agent-Flags (see /api/platform/tenants/{tenantId}/flags)</div>
}

type AuditRow = { id: string; action: string; created_at: string; source: 'platform' | 'tenant' }

function AuditTab({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  useEffect(() => {
    fetch(`/api/platform/tenants/${tenantId}/audit`)
      .then(r => r.json())
      .then(d => setRows(d.entries ?? []))
  }, [tenantId])
  if (!rows) return <div className="text-on-surface-variant">Loading…</div>
  if (rows.length === 0) return <div className="text-on-surface-variant">No audit entries.</div>
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
      <ul className="space-y-2 text-sm">
        {rows.map(r => (
          <li key={`${r.source}:${r.id}`} className="flex justify-between border-b border-outline-variant/40 py-2">
            <span><span className="text-[10px] uppercase font-bold mr-2 text-secondary">{r.source}</span> {r.action}</span>
            <span className="text-xs text-on-surface-variant">{new Date(r.created_at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
