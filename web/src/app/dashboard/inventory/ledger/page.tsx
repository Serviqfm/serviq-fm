'use client'

// Stock transaction ledger (FM-10 / MKT-05). Read-only view of every stock movement:
// PO receipts, adjustments, WO consumption. New page — does not touch the inventory list.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'

const REASON_LABEL: Record<string, string> = {
  adjust: 'Adjustment',
  receive: 'PO Receipt',
  consume_wo: 'WO Consumption',
}

export default function StockLedgerPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterReason, setFilterReason] = useState<'all' | 'adjust' | 'receive' | 'consume_wo'>('all')
  const [search, setSearch] = useState('')
  const supabase = createClient()
  const { t } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchLedger() }, [])

  async function fetchLedger() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data } = await supabase
      .from('stock_transactions')
      .select('*, item:item_id(name, sku, unit), actor:created_by(full_name)')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false })
      .limit(500)
    if (data) setRows(data)
    setLoading(false)
  }

  const filtered = rows.filter(r => {
    const matchReason = filterReason === 'all' || r.reason === filterReason
    const matchSearch = !search || r.item?.name?.toLowerCase().includes(search.toLowerCase()) || r.item?.sku?.toLowerCase().includes(search.toLowerCase())
    return matchReason && matchSearch
  })

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/inventory" className="text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined">arrow_back</span>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-on-surface">Stock Ledger</h1>
              <p className="text-on-surface-variant mt-1 text-sm">{filtered.length} movements</p>
            </div>
          </div>
          <Link href="/dashboard/purchase-orders"
            className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-colors text-sm font-semibold">
            <span className="material-symbols-outlined text-base">shopping_cart</span>Purchase Orders
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative max-w-md w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline-variant text-lg">search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item…"
              className="w-full pl-9 pr-4 py-2.5 bg-surface-container-low border border-outline-variant/40 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['all', 'receive', 'adjust', 'consume_wo'] as const).map(r => (
              <button key={r} onClick={() => setFilterReason(r)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${filterReason === r ? 'bg-primary/10 text-primary border border-primary/40' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}>
                {r === 'all' ? 'All' : REASON_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">receipt_long</span>
            <p className="text-lg font-semibold mb-1">No stock movements yet</p>
            <p className="text-sm">Receiving a PO or adjusting stock records a ledger entry here.</p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    {['Date', 'Item', 'Reason', 'Change', 'Note', 'By'].map(h => (
                      <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.map(r => {
                    const delta = Number(r.delta ?? 0)
                    return (
                      <tr key={r.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="px-4 py-4 text-sm text-on-surface-variant whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="px-4 py-4 text-sm">
                          <span className="font-semibold text-on-surface">{r.item?.name ?? '—'}</span>
                          {r.item?.sku && <span className="text-xs text-on-surface-variant ml-2">{r.item.sku}</span>}
                        </td>
                        <td className="px-4 py-4 text-sm text-on-surface-variant whitespace-nowrap">{REASON_LABEL[r.reason] ?? r.reason}</td>
                        <td className={`px-4 py-4 text-sm font-bold whitespace-nowrap ${delta >= 0 ? 'text-primary' : 'text-error'}`}>
                          {delta >= 0 ? '+' : ''}{delta}{r.item?.unit ? ' ' + r.item.unit : ''}
                        </td>
                        <td className="px-4 py-4 text-sm text-on-surface-variant">{r.note ?? '—'}</td>
                        <td className="px-4 py-4 text-sm text-on-surface-variant whitespace-nowrap">{r.actor?.full_name ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
