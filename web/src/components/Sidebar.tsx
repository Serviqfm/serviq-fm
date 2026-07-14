'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { useFeatureFlag } from '@/lib/featureFlags'
import { Logo } from '@/components/brand/Logo'
import NotificationBell from '@/components/NotificationBell'

// roles: items listed here are visible only to these roles. Items without `roles` are visible to everyone.
const NAV: { key: string; href: string; en: string; ar: string; icon: string; exact: boolean; roles?: string[] }[] = [
  { key: 'dashboard',   href: '/dashboard',              en: 'Dashboard',    ar: 'لوحة التحكم',   icon: 'dashboard',      exact: true  },
  { key: 'work_orders', href: '/dashboard/work-orders',  en: 'Work Orders',  ar: 'أوامر العمل',   icon: 'assignment',     exact: false },
  { key: 'requests',    href: '/dashboard/requests',     en: 'Requests',     ar: 'الطلبات',        icon: 'inbox',          exact: false, roles: ['admin', 'manager'] },
  { key: 'assets',      href: '/dashboard/assets',       en: 'Assets',       ar: 'الأصول',         icon: 'inventory_2',    exact: false },
  { key: 'asset_log',   href: '/dashboard/asset-log',    en: 'Asset Log',    ar: 'سجل الأصول',     icon: 'list_alt',       exact: false },
  { key: 'pm',          href: '/dashboard/pm-schedules', en: 'PM Schedules', ar: 'جدول الصيانة',  icon: 'event_repeat',   exact: false },
  { key: 'meters',      href: '/dashboard/meters',       en: 'Meters',       ar: 'العدادات',       icon: 'speed',          exact: false },
  { key: 'sites',       href: '/dashboard/sites',        en: 'Sites',        ar: 'المواقع',        icon: 'location_city',  exact: false, roles: ['admin', 'manager'] },
  { key: 'vendors',     href: '/dashboard/vendors',      en: 'Vendors',      ar: 'الموردون',       icon: 'business',       exact: false, roles: ['admin', 'manager'] },
  { key: 'inspections', href: '/dashboard/inspections',  en: 'Inspections',  ar: 'التفتيش',        icon: 'fact_check',     exact: false },
  { key: 'inventory',   href: '/dashboard/inventory',    en: 'Inventory',    ar: 'المخزون',        icon: 'category',       exact: false },
  { key: 'files',       href: '/dashboard/files',        en: 'Files',        ar: 'الملفات',       icon: 'folder',         exact: false },
  { key: 'users',       href: '/dashboard/users',        en: 'Users',        ar: 'المستخدمون',     icon: 'group',          exact: false, roles: ['admin', 'manager'] },
  { key: 'teams',       href: '/dashboard/teams',        en: 'Teams',        ar: 'الفرق',           icon: 'groups',         exact: false, roles: ['admin', 'manager'] },
  { key: 'invoices',    href: '/dashboard/invoices',     en: 'Invoices',     ar: 'الفواتير',        icon: 'receipt_long',   exact: false, roles: ['admin', 'manager'] },
  { key: 'reports',     href: '/dashboard/reports',      en: 'Reports',      ar: 'التقارير',        icon: 'bar_chart',      exact: false, roles: ['admin', 'manager'] },
  { key: 'settings',    href: '/dashboard/settings',     en: 'Settings',     ar: 'الإعدادات',      icon: 'settings',       exact: false },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { lang, setLang } = useLanguage()
  const [collapsed, setCollapsed] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null)
  const [woBadge, setWoBadge] = useState(0)
  const [reqBadge, setReqBadge] = useState(0)
  const supabase = createClient()
  const isAr = lang === 'ar'
  const { flags } = useFeatureFlag()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadUser() }, [])

  async function loadUser() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: profile } = await supabase
      .from('users')
      .select('*, organisation:organisation_id(name)')
      .eq('id', authUser.id)
      .single()
    if (profile) {
      setUser(profile)
      const { count } = await supabase
        .from('work_orders')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', profile.organisation_id)
        .not('status', 'in', '("completed","closed")')
      if (count) setWoBadge(count)
      const { count: rCount } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', profile.organisation_id)
        .eq('status', 'pending')
      if (rCount) setReqBadge(rCount)
    }
  }

  return (
    <aside className={`flex flex-col h-screen sticky top-0 bg-surface-container-lowest border-r border-outline-variant/20 shadow-sm overflow-y-auto overflow-x-hidden flex-shrink-0 z-50 transition-all duration-200 ${collapsed ? 'w-16' : 'w-64'}`}>

      {/* Brand */}
      <div className={`flex items-center h-14 flex-shrink-0 border-b border-outline-variant/20 ${collapsed ? 'justify-center px-3' : 'justify-between px-4'}`}>
        {!collapsed && (
          <Logo href="/dashboard" size={130} />
        )}
        {collapsed && (
          <Logo href="/dashboard" variant="icon" size={32} />
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`w-6 h-6 rounded-md border border-outline-variant/40 bg-surface-container-low flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors flex-shrink-0 ${collapsed ? 'absolute top-4 -right-3 bg-surface-container-lowest border border-outline-variant shadow-sm z-10' : ''}`}
        >
          <span className="material-symbols-outlined text-sm">{collapsed ? 'chevron_right' : 'chevron_left'}</span>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 flex flex-col gap-0.5">
        {NAV
          .filter(item => !item.roles || (user && item.roles.includes(user.role)))
          .filter(item => {
            // Feature-flag gates
            if (item.key === 'invoices' && !flags.invoicing) return false
            if (item.key === 'reports' && !flags.advanced_reporting) return false
            return true
          })
          .map(item => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          const label = isAr ? item.ar : item.en
          const isWO = item.key === 'work_orders'
          const isReq = item.key === 'requests'

          return (
            <Link key={item.key} href={item.href} title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-low'
              } ${collapsed ? 'justify-center' : ''} ${isAr ? 'flex-row-reverse' : ''}`}
            >
              <span className={`material-symbols-outlined text-xl flex-shrink-0 ${isActive ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'}`}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}>
                {item.icon}
              </span>

              {!collapsed && (
                <>
                  <span className={`flex-1 text-sm truncate ${isAr ? 'text-right' : ''}`} style={{ fontFamily: isAr ? 'Readex Pro, sans-serif' : 'DM Sans, sans-serif' }}>
                    {label}
                  </span>
                  {isWO && woBadge > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isActive ? 'bg-primary/20 text-primary' : 'bg-primary/10 text-primary'}`}>
                      {woBadge > 99 ? '99+' : woBadge}
                    </span>
                  )}
                  {isReq && reqBadge > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-error/10 text-error">
                      {reqBadge > 99 ? '99+' : reqBadge}
                    </span>
                  )}
                </>
              )}

              {/* Collapsed badges — dot only */}
              {collapsed && isWO && woBadge > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
              )}
              {collapsed && isReq && reqBadge > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-outline-variant/20 p-2 flex flex-col gap-0.5 flex-shrink-0">

        {/* Notification bell + in-app alert center (CORE-15) */}
        <NotificationBell collapsed={collapsed} />

        {/* Language toggle */}
        <button
          onClick={() => setLang(isAr ? 'en' : 'ar')}
          title={collapsed ? (isAr ? 'Switch to English' : 'التبديل إلى العربية') : undefined}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-all w-full ${collapsed ? 'justify-center' : ''}`}
        >
          <span className="material-symbols-outlined text-xl flex-shrink-0">language</span>
          {!collapsed && <span className="text-sm">{isAr ? 'English' : 'العربية'}</span>}
        </button>

        {/* User row */}
        {user && (
          <div className={`flex items-center gap-2 px-3 py-2 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-7 h-7 rounded-full flex-shrink-0 bg-primary flex items-center justify-center">
              <span className="text-on-primary text-xs font-bold">
                {user.full_name?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-on-surface truncate">{user.full_name}</div>
                <div className="text-[10px] text-on-surface-variant truncate">{user.email}</div>
              </div>
            )}
          </div>
        )}

        {/* Sign out */}
        <form action='/auth/logout' method='post'>
          <button
            type='submit'
            title={collapsed ? (isAr ? 'تسجيل الخروج' : 'Sign Out') : undefined}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 transition-all w-full ${collapsed ? 'justify-center' : ''}`}
          >
            <span className="material-symbols-outlined text-xl flex-shrink-0">logout</span>
            {!collapsed && <span className="text-sm">{isAr ? 'تسجيل الخروج' : 'Sign Out'}</span>}
          </button>
        </form>
      </div>
    </aside>
  )
}
