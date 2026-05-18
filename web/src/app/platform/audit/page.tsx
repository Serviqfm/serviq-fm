'use client'
import { useEffect, useState } from 'react'

type Row = {
  id: string
  source: 'platform' | 'impersonated' | 'tenant'
  action: string
  org_id: string | null
  actor: string | null
  created_at: string
  details: Record<string, unknown> | null
}

const SOURCE_BADGE: Record<Row['source'], string> = {
  platform: 'bg-primary/10 text-primary border-primary/20',
  impersonated: 'bg-error/10 text-error border-error/20',
  tenant: 'bg-surface-container-low text-on-surface-variant border-outline-variant',
}

export default function AuditPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [includeAll, setIncludeAll] = useState(false)
  const [actionFilter, setActionFilter] = useState('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (includeAll) params.set('include_all_tenant', '1')
    if (actionFilter) params.set('action', actionFilter)
    fetch(`/api/platform/audit?${params}`)
      .then(r => r.json())
      .then(d => setRows(d.entries ?? []))
  }, [includeAll, actionFilter])

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <h1 className="text-2xl font-bold text-on-surface mb-6">Audit Log</h1>
      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={includeAll}
            onChange={e => setIncludeAll(e.target.checked)}
          />
          Include all tenant activity
        </label>
        <input
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          placeholder="Filter action…"
          className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-2 text-sm max-w-xs text-on-surface"
        />
      </div>
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-container-low text-[11px] uppercase tracking-wider text-secondary">
            <tr>
              <th className="px-4 py-3 text-left">When</th>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Org</th>
              <th className="px-4 py-3 text-left">Actor</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant text-sm">
                  No audit entries.
                </td>
              </tr>
            ) : (
              rows.map(r => (
                <tr key={r.source + ':' + r.id} className="border-t border-outline-variant/40">
                  <td className="px-4 py-2 text-on-surface-variant text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full border text-xs font-semibold ${SOURCE_BADGE[r.source]}`}
                    >
                      {r.source}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-on-surface">{r.action}</td>
                  <td className="px-4 py-2 text-on-surface-variant text-xs font-mono">
                    {r.org_id?.slice(0, 8) ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-on-surface-variant text-xs font-mono">
                    {r.actor?.slice(0, 8) ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
