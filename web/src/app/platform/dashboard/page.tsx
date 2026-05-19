'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { formatSAR } from '@/lib/currency'

type Metrics = {
  mrrCents: number
  arrCents: number
  activeTenants: number
  payingTenants: number
  churnRate30d: number
  dau: number
  mau: number
  planCounts: Record<string, number>
  top10ByWO: { orgId: string; orgName: string; count: number }[]
  mrrSnapshots: { snapshot_date: string; mrr_cents: number }[]
  needsAttention: {
    id: string
    name: string
    plan: string
    billing_status: string
    mrr_cents: number
    total_score: number
  }[]
}

const PLAN_COLORS: Record<string, string> = {
  free: '#9ca3af',
  starter: '#60a5fa',
  pro: '#10b981',
  enterprise: '#f59e0b',
}

export default function PlatformDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)

  useEffect(() => {
    fetch('/api/platform/metrics')
      .then(r => r.json())
      .then(setMetrics)
  }, [])

  if (!metrics) {
    return <div className="p-8 text-on-surface-variant">Loading…</div>
  }

  const planData = Object.entries(metrics.planCounts).map(([plan, count]) => ({ plan, count }))

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-2">Platform Dashboard</h1>
      <p className="text-sm text-on-surface-variant mb-8">
        Real-time platform metrics across all tenants.
      </p>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Kpi label="MRR" value={formatSAR(metrics.mrrCents)} />
        <Kpi label="ARR" value={formatSAR(metrics.arrCents)} />
        <Kpi label="Active tenants" value={String(metrics.activeTenants)} />
        <Kpi label="Churn (30d)" value={`${metrics.churnRate30d}%`} />
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Kpi label="DAU" value={String(metrics.dau)} />
        <Kpi label="MAU" value={String(metrics.mau)} />
      </div>

      {/* MRR line chart */}
      <Section title="MRR over time (last 6 months)">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={metrics.mrrSnapshots.map(s => ({
              date: s.snapshot_date,
              mrr: s.mrr_cents / 100,
            }))}
          >
            <XAxis dataKey="date" stroke="#888" fontSize={12} />
            <YAxis stroke="#888" fontSize={12} />
            <Tooltip formatter={(v: number | string | ReadonlyArray<number | string> | undefined) => {
              const n = typeof v === 'number' ? v : Array.isArray(v) ? 0 : Number(v ?? 0)
              return formatSAR(n * 100)
            }} />
            <Line type="monotone" dataKey="mrr" stroke="#006b54" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Section title="Top 10 tenants by WO (last 30d)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={metrics.top10ByWO} layout="vertical">
              <XAxis type="number" stroke="#888" fontSize={12} />
              <YAxis
                dataKey="orgName"
                type="category"
                stroke="#888"
                fontSize={12}
                width={120}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#006b54" />
            </BarChart>
          </ResponsiveContainer>
        </Section>
        <Section title="Tenants by plan">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={planData}
                dataKey="count"
                nameKey="plan"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label
              >
                {planData.map(d => (
                  <Cell key={d.plan} fill={PLAN_COLORS[d.plan] ?? '#888'} />
                ))}
              </Pie>
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Section>
      </div>

      <Section title="Tenants needing attention">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-secondary border-b border-outline-variant">
              <th className="py-2">Name</th>
              <th>Plan</th>
              <th>Billing</th>
              <th>MRR</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {metrics.needsAttention.map(t => (
              <tr key={t.id} className="border-b border-outline-variant/40">
                <td className="py-2 text-on-surface">{t.name}</td>
                <td className="text-on-surface-variant">{t.plan}</td>
                <td className={t.billing_status === 'paid' ? 'text-primary' : 'text-error'}>
                  {t.billing_status}
                </td>
                <td className="text-on-surface-variant">{formatSAR(t.mrr_cents)}</td>
                <td
                  className={
                    t.total_score < 50 ? 'text-error font-semibold' : 'text-on-surface-variant'
                  }
                >
                  {t.total_score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-1">
        {label}
      </div>
      <div className="text-2xl font-bold text-on-surface">{value}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5 mb-6">
      <h3 className="text-base font-semibold text-on-surface mb-4">{title}</h3>
      {children}
    </div>
  )
}
