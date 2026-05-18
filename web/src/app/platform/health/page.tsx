'use client'
import { useEffect, useState } from 'react'

type Health = {
  supabase: { status: 'ok' | 'error'; latency_ms: number }
  vercel: { indicator: string }
  email_24h: Record<string, number>
  recent_errors: {
    id: string
    status: string
    error_message: string | null
    created_at: string
    type_key: string
  }[]
}

const VERCEL_COLOR: Record<string, string> = {
  none: 'text-primary',
  minor: 'text-[#f57f17]',
  major: 'text-error',
  critical: 'text-error',
  unknown: 'text-on-surface-variant',
}

export default function HealthPage() {
  const [h, setH] = useState<Health | null>(null)

  useEffect(() => {
    fetch('/api/platform/health')
      .then(r => r.json())
      .then(setH)
  }, [])

  if (!h) return <div className="p-8 text-on-surface-variant">Loading…</div>

  const vercelColor = VERCEL_COLOR[h.vercel.indicator] ?? VERCEL_COLOR.unknown

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-6">System Health</h1>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card title="Supabase">
          <div
            className={
              h.supabase.status === 'ok'
                ? 'text-primary text-2xl font-bold'
                : 'text-error text-2xl font-bold'
            }
          >
            {h.supabase.status === 'ok' ? 'OK' : 'Down'}
          </div>
          <div className="text-xs text-on-surface-variant mt-1">{h.supabase.latency_ms} ms</div>
        </Card>
        <Card title="Vercel">
          <div className={`text-2xl font-bold ${vercelColor}`}>{h.vercel.indicator}</div>
        </Card>
        <Card title="Email delivery (24h)">
          {Object.keys(h.email_24h).length === 0 ? (
            <div className="text-on-surface-variant text-sm">No traffic</div>
          ) : (
            <ul className="text-sm space-y-1">
              {Object.entries(h.email_24h).map(([s, c]) => (
                <li key={s} className="flex justify-between text-on-surface">
                  <span>{s}</span>
                  <span className="font-semibold">{c}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent failures">
          {h.recent_errors.length === 0 ? (
            <div className="text-on-surface-variant text-sm">No recent failures</div>
          ) : (
            <ul className="text-xs space-y-2 max-h-48 overflow-y-auto">
              {h.recent_errors.map(e => (
                <li key={e.id}>
                  <div className="text-error">{e.type_key}</div>
                  <div className="text-on-surface-variant">{e.error_message}</div>
                  <div className="text-on-surface-variant/60 text-[10px]">
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-2">
        {title}
      </div>
      {children}
    </div>
  )
}
