'use client'

// AG-10 — Asset Log reports/summary. Org-scoped via RLS on asset_log_items.
// Counts by type/status/space, value totals (current value excludes disposed),
// and decommissioned/disposed lists. Read-only; no new tables.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { currentValue, ASSET_LOG_STATUSES } from '@/lib/asset-log'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = any

const STATUS_LABEL: Record<string, string> = {
  in_storage: 'In storage',
  in_use: 'In use',
  under_repair: 'Under repair',
  damaged: 'Damaged',
  disposed: 'Disposed',
}

export default function AssetLogReportsPage() {
  const supabase = createClient()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'

  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('asset_log_items')
      .select('*, type:type_id(id, name, name_ar), site:site_id(id, name), space:space_id(id, name, floor)')
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }

  const money = (n: number) => `SAR ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const al = (n: number) => 'AL-' + String(n).padStart(4, '0')
  const typeName = (it: Item) => it.type ? (isAr && it.type.name_ar ? it.type.name_ar : it.type.name) : '—'

  const report = useMemo(() => {
    const live = items.filter(it => it.status !== 'disposed')

    // Counts by status (all items).
    const byStatus = ASSET_LOG_STATUSES.map(s => ({
      status: s,
      label: STATUS_LABEL[s],
      count: items.filter(it => it.status === s).length,
    }))

    // Counts + current value by type (value excludes disposed items).
    const typeMap = new Map<string, { name: string; count: number; value: number }>()
    for (const it of items) {
      const name = typeName(it)
      const row = typeMap.get(name) ?? { name, count: 0, value: 0 }
      row.count += 1
      if (it.status !== 'disposed') row.value += currentValue(it) ?? 0
      typeMap.set(name, row)
    }
    const byType = Array.from(typeMap.values()).sort((a, b) => b.count - a.count)

    // Counts by space, grouped under site → floor. Live items only.
    const spaceMap = new Map<string, { site: string; floor: string; space: string; count: number }>()
    for (const it of live) {
      const site = it.site?.name ?? 'Unassigned'
      const floor = it.space?.floor ?? '—'
      const space = it.space?.name ?? 'Unassigned'
      const key = `${site}||${floor}||${space}`
      const row = spaceMap.get(key) ?? { site, floor, space, count: 0 }
      row.count += 1
      spaceMap.set(key, row)
    }
    const bySpace = Array.from(spaceMap.values()).sort(
      (a, b) => a.site.localeCompare(b.site) || a.floor.localeCompare(b.floor) || a.space.localeCompare(b.space)
    )

    // Value totals.
    const purchaseTotal = items.reduce((s, it) => s + (Number(it.purchase_cost) || 0), 0)
    const replacementTotal = live.reduce((s, it) => s + (Number(it.replacement_cost) || 0), 0)
    const currentTotal = live.reduce((s, it) => s + (currentValue(it) ?? 0), 0)

    const decommissioned = items
      .filter(it => it.decommissioned_at)
      .sort((a, b) => String(b.decommissioned_at).localeCompare(String(a.decommissioned_at)))
    const disposed = items
      .filter(it => it.status === 'disposed')
      .sort((a, b) => String(b.decommissioned_at ?? '').localeCompare(String(a.decommissioned_at ?? '')))

    return { byStatus, byType, bySpace, purchaseTotal, replacementTotal, currentTotal, decommissioned, disposed, total: items.length }
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  const card = 'bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm'

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">Asset Log Reports</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{report.total} items across your organisation</p>
          </div>
          <Link href="/dashboard/asset-log">
            <button className="bg-surface-container-lowest text-on-surface border border-outline-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-lg">arrow_back</span>Back to Asset Log
            </button>
          </Link>
        </div>

        {loading ? (
          <div className="text-on-surface-variant text-sm py-20 text-center">Loading…</div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Value summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Total purchase cost', value: money(report.purchaseTotal), icon: 'receipt_long' },
                { label: 'Current value (excl. disposed)', value: money(report.currentTotal), icon: 'trending_down' },
                { label: 'Replacement cost (excl. disposed)', value: money(report.replacementTotal), icon: 'sync' },
              ].map(c => (
                <div key={c.label} className={card}>
                  <div className="flex items-center gap-2 text-on-surface-variant mb-1">
                    <span className="material-symbols-outlined text-lg">{c.icon}</span>
                    <span className="text-xs font-semibold uppercase tracking-wider">{c.label}</span>
                  </div>
                  <div className="text-2xl font-bold text-on-surface">{c.value}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* By status */}
              <div className={card}>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant mb-4">By status</h2>
                <div className="flex flex-col gap-2">
                  {report.byStatus.map(r => (
                    <div key={r.status} className="flex items-center justify-between text-sm">
                      <span className="text-on-surface">{r.label}</span>
                      <span className="font-bold text-on-surface tabular-nums">{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* By type */}
              <div className={card}>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant mb-4">By type</h2>
                <div className="flex flex-col gap-2">
                  {report.byType.length === 0 && <div className="text-sm text-on-surface-variant">No items.</div>}
                  {report.byType.map(r => (
                    <div key={r.name} className="flex items-center justify-between text-sm">
                      <span className="text-on-surface">{r.name}</span>
                      <span className="text-on-surface-variant tabular-nums">
                        {r.count} · <span className="font-semibold text-on-surface">{money(r.value)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* By space */}
            <div className={card}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant mb-4">By location (live items)</h2>
              {report.bySpace.length === 0 ? (
                <div className="text-sm text-on-surface-variant">No located items.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-on-surface-variant border-b border-outline-variant/40">
                        <th className="py-2 font-semibold">Site</th>
                        <th className="py-2 font-semibold">Floor</th>
                        <th className="py-2 font-semibold">Space</th>
                        <th className="py-2 font-semibold text-right">Items</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.bySpace.map((r, i) => (
                        <tr key={i} className="border-b border-outline-variant/20">
                          <td className="py-2 text-on-surface">{r.site}</td>
                          <td className="py-2 text-on-surface-variant">{r.floor}</td>
                          <td className="py-2 text-on-surface-variant">{r.space}</td>
                          <td className="py-2 text-right font-bold text-on-surface tabular-nums">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Decommissioned + disposed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ItemList title="Decommissioned" items={report.decommissioned} al={al} typeName={typeName} dateKey="decommissioned_at" />
              <ItemList title="Disposed" items={report.disposed} al={al} typeName={typeName} dateKey="decommissioned_at" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ItemList({ title, items, al, typeName, dateKey }: {
  title: string
  items: Item[]
  al: (n: number) => string
  typeName: (it: Item) => string
  dateKey: string
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant mb-4">
        {title} <span className="text-on-surface-variant/60">({items.length})</span>
      </h2>
      {items.length === 0 ? (
        <div className="text-sm text-on-surface-variant">None.</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
          {items.map(it => (
            <Link key={it.id} href={`/dashboard/asset-log/${it.id}`}
              className="flex items-center justify-between text-sm hover:bg-surface-container-low rounded-lg px-2 py-1.5 -mx-2 transition-colors">
              <span className="text-on-surface truncate">
                <span className="text-on-surface-variant font-mono text-xs mr-2">{al(it.item_number)}</span>
                {it.name}
              </span>
              <span className="text-on-surface-variant text-xs whitespace-nowrap">
                {typeName(it)}{it[dateKey] ? ` · ${it[dateKey]}` : ''}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
