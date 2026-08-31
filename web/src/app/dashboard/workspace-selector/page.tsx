// web/src/app/dashboard/workspace-selector/page.tsx
// P0 (playbook §2 A2): workspace picker for tenants that have BOTH workspaces.
// Middleware already redirected single-workspace tenants away, so this page never
// has to fetch the flags itself — it only records the choice under
// localStorage['serviqfm_workspace'], which the sidebar reads to pick its nav.
'use client'

import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { writeWorkspace, type Workspace } from '@/lib/workspace'

const CHOICES: { id: Workspace; href: string; icon: string; en: string; ar: string; enDesc: string; arDesc: string }[] = [
  {
    id: 'cafm', href: '/dashboard', icon: 'engineering',
    en: 'Facilities Management', ar: 'إدارة المرافق',
    enDesc: 'Work orders, assets, PM schedules, inspections and everything operational.',
    arDesc: 'أوامر العمل والأصول وجداول الصيانة والتفتيش وجميع العمليات.',
  },
  {
    id: 'procurement', href: '/dashboard/procurement', icon: 'shopping_cart',
    en: 'Procurement', ar: 'المشتريات',
    enDesc: 'Requisitions, purchase orders, vendors, receiving and spend.',
    arDesc: 'طلبات الشراء وأوامر الشراء والموردون والاستلام والإنفاق.',
  },
]

export default function WorkspaceSelectorPage() {
  const { lang } = useLanguage()
  const router = useRouter()
  const isAr = lang === 'ar'

  function pick(choice: typeof CHOICES[number]) {
    writeWorkspace(choice.id)
    router.push(choice.href)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {isAr ? 'اختر مساحة العمل' : 'Choose your workspace'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {isAr
          ? 'يمكنك التبديل في أي وقت من الشريط الجانبي.'
          : 'You can switch at any time from the sidebar.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {CHOICES.map(c => (
          <button key={c.id} onClick={() => pick(c)}
            className={`bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 text-start hover:border-primary hover:shadow-md transition-all group ${isAr ? 'text-right' : ''}`}>
            <div className="p-2 bg-primary/10 text-primary rounded-lg w-fit mb-3 group-hover:scale-110 transition-transform">
              <span className="material-symbols-outlined">{c.icon}</span>
            </div>
            <h2 className="text-xl font-bold text-on-surface">{isAr ? c.ar : c.en}</h2>
            <p className="text-sm text-on-surface-variant mt-2">{isAr ? c.arDesc : c.enDesc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
