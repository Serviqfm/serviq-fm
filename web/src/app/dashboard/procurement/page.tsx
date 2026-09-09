// web/src/app/dashboard/procurement/page.tsx
// Procurement home. P0 shipped this as a nav shell with placeholder tiles; P1
// wires them to real counts now that requisitions exist.
// Reachable only by tenants with organisations.has_procurement.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { poTotal, isCommitted, type PoForReport } from '@/lib/procurementReports'

const LINKS = [
  { href: '/dashboard/procurement/requisitions', icon: 'edit_note', en: 'Requisitions', ar: 'طلبات الشراء' },
  { href: '/dashboard/procurement/reports', icon: 'bar_chart', en: 'Reports', ar: 'التقارير' },
  { href: '/dashboard/purchase-orders', icon: 'shopping_bag', en: 'Purchase Orders', ar: 'أوامر الشراء' },
  { href: '/dashboard/vendors', icon: 'business', en: 'Vendors', ar: 'الموردون' },
  { href: '/dashboard/inventory', icon: 'category', en: 'Inventory', ar: 'المخزون' },
  { href: '/dashboard/cost-centers', icon: 'account_balance_wallet', en: 'Cost Centers', ar: 'مراكز التكلفة' },
]

type Counts = {
  mine: number | null; awaiting: number | null; openPos: number | null
  // P6: committed spend this month, the one money figure worth a tile.
  monthSpend: number | null
}

export default function ProcurementHomePage() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()
  const [counts, setCounts] = useState<Counts>({ mine: null, awaiting: null, openPos: null, monthSpend: null })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase
      .from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const org = profile.organisation_id

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const [mineRes, pendingRes, posRes, spendRes] = await Promise.all([
      supabase.from('requisitions').select('id', { count: 'exact', head: true })
        .eq('organisation_id', org).eq('created_by', user.id),
      // Every pending step of every in-flight requisition. Small (only unfinished
      // chains), and it's the only way to tell "my turn" from "my step, later" —
      // the current approver is the LOWEST pending step, matching the RPC.
      supabase.from('requisition_approvals').select('requisition_id, step_order, approver_user_id')
        .eq('organisation_id', org).eq('status', 'pending'),
      supabase.from('purchase_orders').select('id', { count: 'exact', head: true })
        .eq('organisation_id', org).in('status', ['draft', 'sent', 'acknowledged', 'in_transit']),
      // Month-to-date committed spend, totalled by the same pure function the
      // reports page uses so the two screens can never disagree.
      supabase.from('purchase_orders')
        .select('id, status, created_at, items:purchase_order_items(quantity, unit_cost)')
        .eq('organisation_id', org)
        .gte('created_at', monthStart),
    ])

    const lowest = new Map<string, { step: number; approver: string | null }>()
    for (const row of pendingRes.data ?? []) {
      const cur = lowest.get(row.requisition_id)
      if (!cur || row.step_order < cur.step) {
        lowest.set(row.requisition_id, { step: row.step_order, approver: row.approver_user_id })
      }
    }
    const awaiting = pendingRes.error
      ? null
      : Array.from(lowest.values()).filter(v => v.approver === user.id).length

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monthPos: PoForReport[] = spendRes.error ? [] : (spendRes.data ?? []).map((p: any) => ({
      id: p.id, status: p.status, created_at: p.created_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines: (p.items ?? []).map((l: any) => ({ quantity: l.quantity, unit_cost: l.unit_cost })),
    }))

    setCounts({
      mine: mineRes.error ? null : (mineRes.count ?? 0),
      awaiting,
      openPos: posRes.error ? null : (posRes.count ?? 0),
      monthSpend: spendRes.error
        ? null
        : monthPos.filter(isCommitted).reduce((sum, p) => sum + poTotal(p), 0),
    })
  }

  const tiles = [
    { icon: 'edit_note', en: 'My requisitions', ar: 'طلباتي', value: counts.mine, href: '/dashboard/procurement/requisitions' },
    { icon: 'how_to_reg', en: 'Awaiting my approval', ar: 'بانتظار موافقتي', value: counts.awaiting, href: '/dashboard/procurement/requisitions' },
    { icon: 'receipt_long', en: 'Open purchase orders', ar: 'أوامر الشراء المفتوحة', value: counts.openPos, href: '/dashboard/purchase-orders' },
    {
      icon: 'payments', en: 'Committed this month', ar: 'التزامات هذا الشهر',
      value: counts.monthSpend, href: '/dashboard/procurement/reports',
      // A money tile at 5xl would wrap; it also reads as currency, not a count.
      money: true,
    },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {isAr ? 'المشتريات' : 'Procurement'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {isAr ? 'نظرة عامة على طلبات الشراء وأوامر الشراء.' : 'Your requisitions, approvals and purchase orders at a glance.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {tiles.map(t => (
          <Link key={t.icon} href={t.href}
            className="bg-surface-container-lowest border border-outline-variant p-4 rounded-[12px] shadow-sm hover:border-primary transition-colors">
            <div className="p-2 bg-primary/10 text-primary rounded-lg w-fit mb-2">
              <span className="material-symbols-outlined">{t.icon}</span>
            </div>
            <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-1">
              {isAr ? t.ar : t.en}
            </p>
            <h3 className={`${t.money ? 'text-3xl' : 'text-5xl'} font-bold leading-none ${t.value == null ? 'text-outline' : 'text-on-surface'}`}>
              {t.value == null
                ? '—'
                : t.money
                  ? `${t.value.toLocaleString('en-SA', { maximumFractionDigits: 0 })} SAR`
                  : t.value}
            </h3>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {LINKS.map(l => (
          <Link key={l.href} href={l.href}
            className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-4 flex items-center gap-3 hover:border-primary transition-colors">
            <span className="material-symbols-outlined text-primary">{l.icon}</span>
            <span className="text-sm font-semibold text-on-surface">{isAr ? l.ar : l.en}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
