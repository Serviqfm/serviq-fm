// web/src/app/dashboard/procurement/page.tsx
// P0: procurement home — the nav shell's landing page. The three summary tiles
// are placeholders on purpose; P1 (requisitions + approval chains) wires them to
// real queries. Reachable only by tenants with organisations.has_procurement.
'use client'

import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

const TILES = [
  { icon: 'edit_note', en: 'My requisitions', ar: 'طلبات الشراء الخاصة بي' },
  { icon: 'how_to_reg', en: 'Awaiting my approval', ar: 'بانتظار موافقتي' },
  { icon: 'receipt_long', en: 'Open purchase orders', ar: 'أوامر الشراء المفتوحة' },
]

const LINKS = [
  { href: '/dashboard/purchase-orders', icon: 'shopping_bag', en: 'Purchase Orders', ar: 'أوامر الشراء' },
  { href: '/dashboard/vendors', icon: 'business', en: 'Vendors', ar: 'الموردون' },
  { href: '/dashboard/inventory', icon: 'category', en: 'Inventory', ar: 'المخزون' },
  { href: '/dashboard/cost-centers', icon: 'account_balance_wallet', en: 'Cost Centers', ar: 'مراكز التكلفة' },
]

export default function ProcurementHomePage() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'

  return (
    <div className="p-6 max-w-6xl mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {isAr ? 'المشتريات' : 'Procurement'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {isAr ? 'نظرة عامة على طلبات الشراء وأوامر الشراء.' : 'Your requisitions, approvals and purchase orders at a glance.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        {TILES.map(t => (
          <div key={t.icon} className="bg-surface-container-lowest border border-outline-variant p-4 rounded-[12px] shadow-sm">
            <div className="p-2 bg-primary/10 text-primary rounded-lg w-fit mb-2">
              <span className="material-symbols-outlined">{t.icon}</span>
            </div>
            <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-1">
              {isAr ? t.ar : t.en}
            </p>
            <h3 className="text-5xl font-bold leading-none text-outline">—</h3>
            <p className="text-xs text-outline mt-2">
              {isAr ? 'يتوفر مع وحدة طلبات الشراء' : 'Available with the requisitions module'}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
