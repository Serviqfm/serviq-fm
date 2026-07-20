'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'

const STATUS_CLS: Record<string, string> = {
  draft: 'bg-outline-variant/20 text-on-surface-variant border border-outline-variant/30',
  sent: 'bg-secondary/10 text-secondary border border-secondary/20',
  received: 'bg-primary/10 text-primary border border-primary/20',
  cancelled: 'bg-error/10 text-error border border-error/20',
}

export default function PurchaseOrdersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pos, setPos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [receiving, setReceiving] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'sent' | 'received' | 'cancelled'>('all')
  // FM-17: org-level module toggle (Settings → Purchasing). Default on;
  // a missing column (pre-migration) leaves it on, like lib/featureFlags.ts.
  const [moduleEnabled, setModuleEnabled] = useState(true)
  const supabase = createClient()
  const { t } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPOs() }, [])

  async function fetchPOs() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data: org } = await supabase
      .from('organisations').select('purchasing_enabled').eq('id', profile.organisation_id).single()
    if (org?.purchasing_enabled === false) { setModuleEnabled(false); setLoading(false); return }
    const { data } = await supabase
      .from('purchase_orders')
      .select('*, vendor:vendor_id(company_name), items:purchase_order_items(quantity, unit_cost)')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false })
    if (data) setPos(data)
    setLoading(false)
  }

  async function receive(id: string) {
    if (!confirm('Receive this purchase order? Stock will be incremented and a ledger entry recorded.')) return
    setReceiving(id)
    const res = await fetch(`/api/purchase-orders/${id}/receive`, { method: 'POST' })
    setReceiving(null)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      alert(body.error || 'Failed to receive purchase order')
      return
    }
    await fetchPOs()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function poTotal(po: any): number {
    return (po.items ?? []).reduce((sum: number, l: any) => sum + Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0), 0) // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  const filtered = pos.filter(p => filterStatus === 'all' || p.status === filterStatus)
  const openCount = pos.filter(p => p.status === 'draft' || p.status === 'sent').length

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  if (!moduleEnabled) return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-xl mx-auto text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
        <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">shopping_cart_off</span>
        <p className="text-lg font-semibold mb-1 text-on-surface">Purchase Orders is disabled</p>
        <p className="text-sm mb-4">An organisation admin turned this module off.</p>
        <Link href="/dashboard/settings/purchasing" className="text-primary text-sm font-semibold hover:underline">Purchasing Settings</Link>
      </div>
    </div>
  )

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">Purchase Orders</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {pos.length} total
              {openCount > 0 && <span className="text-secondary ml-2">· {openCount} open</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/settings/purchasing" title="Purchasing Settings"
              className="flex items-center px-3 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-base">settings</span>
            </Link>
            <Link href="/dashboard/inventory/ledger"
              className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-colors text-sm font-semibold">
              <span className="material-symbols-outlined text-base">receipt_long</span>Stock Ledger
            </Link>
            <Link href="/dashboard/purchase-orders/new">
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">add</span>New PO
              </button>
            </Link>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'draft', 'sent', 'received', 'cancelled'] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors ${filterStatus === s ? 'bg-primary/10 text-primary border border-primary/40' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}>
              {s}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">shopping_cart</span>
            <p className="text-lg font-semibold mb-1">No purchase orders</p>
            <p className="text-sm">Create a PO to restock low inventory.</p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    {['PO #', 'Vendor', 'Status', 'Lines', 'Total (SAR)', 'Expected', t('common.actions')].map(h => (
                      <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.map(po => (
                    <tr key={po.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-4 py-4 text-sm font-semibold text-on-surface whitespace-nowrap">#{po.po_number}</td>
                      <td className="px-4 py-4 text-sm text-on-surface-variant">{po.vendor?.company_name ?? '—'}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_CLS[po.status] ?? ''}`}>{po.status}</span>
                      </td>
                      <td className="px-4 py-4 text-sm text-on-surface-variant">{(po.items ?? []).length}</td>
                      <td className="px-4 py-4 text-sm text-on-surface-variant whitespace-nowrap">{poTotal(po).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-sm text-on-surface-variant whitespace-nowrap">{po.expected_at ?? '—'}</td>
                      <td className="px-4 py-4">
                        {(po.status === 'draft' || po.status === 'sent') ? (
                          <button onClick={() => receive(po.id)} disabled={receiving === po.id}
                            className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50">
                            {receiving === po.id ? '…' : 'Receive'}
                          </button>
                        ) : (
                          <span className="text-xs text-on-surface-variant">
                            {po.status === 'received' && po.received_at ? new Date(po.received_at).toLocaleDateString() : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
