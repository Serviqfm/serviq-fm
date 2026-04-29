'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

// ── Inline SVG icons (no emoji, no encoding issues) ────────────────────────
const SvgIcon = ({ d, d2, size = 17 }: { d: string; d2?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }}>
    <path d={d} />
    {d2 && <path d={d2} />}
  </svg>
)

const ICONS = {
  dashboard:   <SvgIcon d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />,
  work_orders: <SvgIcon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />,
  assets:      <SvgIcon d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z" d2="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />,
  pm:          <SvgIcon d="M3 4h18v2H3zM3 10h18v2H3zM3 16h18v2H3z" />,
  sites:       <SvgIcon d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z" d2="M12 13a3 3 0 100-6 3 3 0 000 6z" />,
  vendors:     <SvgIcon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  inspections: <SvgIcon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
  inventory:   <SvgIcon d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />,
  users:       <SvgIcon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8z" />,
  reports:     <SvgIcon d="M3 20V10h4v10H3zM10 20V4h4v16h-4zM17 20v-6h4v6h-4z" />,
  settings:    <SvgIcon d="M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />,
  language:    <SvgIcon d="M3 5h12M9 3v2M12 5c0 5-3 9-6 11M6 9c0 2 1.5 4 3 5M13 21l4-10 4 10M15.5 16h5" />,
  signout:     <SvgIcon d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />,
  chevronL:    <SvgIcon d="M15 18l-6-6 6-6" size={13} />,
  chevronR:    <SvgIcon d="M9 18l6-6-6-6" size={13} />,
}

// ── Nav items — hardcoded bilingual labels, no t() dependency ──────────────
const NAV = [
  { key: 'dashboard',   href: '/dashboard',              en: 'Dashboard',    ar: 'لوحة التحكم',   exact: true  },
  { key: 'work_orders', href: '/dashboard/work-orders',  en: 'Work Orders',  ar: 'أوامر العمل',   exact: false },
  { key: 'assets',      href: '/dashboard/assets',       en: 'Assets',       ar: 'الأصول',         exact: false },
  { key: 'pm',          href: '/dashboard/pm-schedules', en: 'PM Schedules', ar: 'جدول الصيانة',  exact: false },
  { key: 'sites',       href: '/dashboard/sites',        en: 'Sites',        ar: 'المواقع',        exact: false },
  { key: 'vendors',     href: '/dashboard/vendors',      en: 'Vendors',      ar: 'الموردون',       exact: false },
  { key: 'inspections', href: '/dashboard/inspections',  en: 'Inspections',  ar: 'التفتيش',        exact: false },
  { key: 'inventory',   href: '/dashboard/inventory',    en: 'Inventory',    ar: 'المخزون',        exact: false },
  { key: 'users',       href: '/dashboard/users',        en: 'Users',        ar: 'المستخدمون',     exact: false },
  { key: 'reports',     href: '/dashboard/reports',      en: 'Reports',      ar: 'التقارير',        exact: false },
  { key: 'settings',    href: '/dashboard/settings',     en: 'Settings',     ar: 'الإعدادات',      exact: false },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { lang, setLang } = useLanguage()
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [woBadge, setWoBadge] = useState(0)
  const supabase = createClient()
  const isAr = lang === 'ar'

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
    }
  }

  const W = collapsed ? 64 : 232
  const fontEN = 'DM Sans, sans-serif'
  const fontAR = 'Readex Pro, sans-serif'
  const font = isAr ? fontAR : fontEN

  const navItemStyle = (isActive: boolean, isCollapsed: boolean) => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: isCollapsed ? '9px 0' : '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    background: isActive ? '#1E2D4E' : 'transparent',
    color: isActive ? '#ffffff' : '#4A5568',
    justifyContent: isCollapsed ? 'center' as const : 'flex-start' as const,
    position: 'relative' as const,
    transition: 'background 0.12s',
    textDecoration: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  })

  const footerBtnStyle = (isCollapsed: boolean) => ({
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 10,
    padding: isCollapsed ? '9px 0' : '8px 10px',
    borderRadius: 8,
    background: 'transparent',
    border: 'none',
    color: '#4A5568',
    cursor: 'pointer',
    width: '100%',
    justifyContent: isCollapsed ? 'center' as const : 'flex-start' as const,
    fontFamily: font,
    fontSize: 13,
    fontWeight: 500,
  })

  return (
    <aside style={{
      width: W, minWidth: W, maxWidth: W,
      minHeight: '100vh', height: '100vh',
      position: 'sticky', top: 0,
      background: '#ffffff',
      borderRight: '1px solid #E8ECF0',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.2s ease, min-width 0.2s ease',
      overflowY: 'auto', overflowX: 'hidden',
      flexShrink: 0, zIndex: 100,
    }}>

      {/* ── Brand ──────────────────────────────────────────────────── */}
      <div style={{
        height: 60, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '0 14px' : '0 12px 0 16px',
        borderBottom: '1px solid #E8ECF0',
        gap: 8,
      }}>
        {/* Icon */}
        <img
          src="/ServiqFM_Icon_v2.png"
          alt="ServiqFM"
          style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, objectFit: 'contain' }}
        />

        {/* Collapse button */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: '#F8FAFC', border: '1px solid #E8ECF0',
              color: '#A0B0BF', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
            }}>
            {ICONS.chevronL}
          </button>
        )}
        {collapsed && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              position: 'absolute', top: 20, right: -11,
              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
              background: '#fff', border: '1px solid #E8ECF0',
              color: '#A0B0BF', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, zIndex: 10,
            }}>
            {ICONS.chevronR}
          </button>
        )}
      </div>

      {/* ── Nav ────────────────────────────────────────────────────── */}
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(item => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          const label = isAr ? item.ar : item.en
          const isWO = item.key === 'work_orders'
          const iconEl = ICONS[item.key as keyof typeof ICONS]

          return (
            <Link key={item.key} href={item.href} style={{ textDecoration: 'none' }}>
              <div title={collapsed ? label : undefined} style={navItemStyle(isActive, collapsed)}>

                {/* Icon */}
                <span style={{ color: isActive ? '#ffffff' : '#A0B0BF', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {iconEl}
                </span>

                {/* Label */}
                {!collapsed && (
                  <span style={{
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#ffffff' : '#4A5568',
                    flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontFamily: font, direction: isAr ? 'rtl' : 'ltr',
                  }}>{label}</span>
                )}

                {/* WO badge — expanded */}
                {!collapsed && isWO && woBadge > 0 && (
                  <span style={{
                    background: isActive ? 'rgba(255,255,255,0.2)' : '#1A7FC11A',
                    color: isActive ? '#fff' : '#1A7FC1',
                    fontSize: 11, fontWeight: 700,
                    padding: '1px 6px', borderRadius: 999,
                    minWidth: 20, textAlign: 'center', flexShrink: 0,
                  }}>
                    {woBadge > 99 ? '99+' : woBadge}
                  </span>
                )}

                {/* WO badge — collapsed dot */}
                {collapsed && isWO && woBadge > 0 && (
                  <span style={{
                    position: 'absolute', top: 5, right: 8,
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#1A7FC1',
                  }} />
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #E8ECF0', padding: '8px 8px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>

        {/* Language toggle */}
        <button
          onClick={() => setLang(isAr ? 'en' : 'ar')}
          title={isAr ? 'Switch to English' : 'التبديل إلى العربية'}
          style={footerBtnStyle(collapsed)}>
          <span style={{ color: '#A0B0BF', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {ICONS.language}
          </span>
          {!collapsed && <span style={{ color: '#4A5568' }}>{isAr ? 'English' : 'العربية'}</span>}
        </button>

        {/* User row */}
        {user && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: collapsed ? '8px 0' : '8px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#6DCFB0,#1A7FC1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>
                {user.full_name?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            {!collapsed && (
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1E2D4E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: font }}>
                  {user.full_name}
                </div>
                <div style={{ fontSize: 10, color: '#A0B0BF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: fontEN }}>
                  {user.email}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sign out */}
        <form action='/auth/logout' method='post'>
          <button
            type='submit'
            title={collapsed ? (isAr ? 'تسجيل الخروج' : 'Sign Out') : undefined}
            style={{ ...footerBtnStyle(collapsed), color: '#A0B0BF' }}>
            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {ICONS.signout}
            </span>
            {!collapsed && <span>{isAr ? 'تسجيل الخروج' : 'Sign Out'}</span>}
          </button>
        </form>
      </div>
    </aside>
  )
}
