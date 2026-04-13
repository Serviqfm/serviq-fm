content = """'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import LanguageToggle from '@/components/LanguageToggle'

export default function Sidebar() {
  const { t, isRTL } = useLanguage()
  const pathname = usePathname()
  const supabase = createClient()
  const [collapsed, setCollapsed] = useState(false)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [openWOs, setOpenWOs] = useState(0)
  const [pmDue, setPmDue] = useState(0)

  const navItems = [
    { label: t('nav.dashboard'),   href: '/dashboard',                    icon: 'D', badge: '',     exact: true  },
    { label: t('nav.workorders'),  href: '/dashboard/work-orders',        icon: 'W', badge: 'open', exact: false },
    { label: t('nav.assets'),      href: '/dashboard/assets',             icon: 'A', badge: '',     exact: false },
    { label: t('nav.pm'),          href: '/dashboard/pm-schedules',       icon: 'P', badge: 'due',  exact: false },
    { label: t('nav.sites'),       href: '/dashboard/sites',              icon: 'S', badge: '',     exact: false },
    { label: t('nav.vendors'),     href: '/dashboard/vendors',            icon: 'N', badge: '',     exact: false },
    { label: t('nav.inspections'), href: '/dashboard/inspections',        icon: 'I', badge: '',     exact: false },
    { label: t('nav.inventory'),   href: '/dashboard/inventory',          icon: 'V', badge: '',     exact: false },
    { label: t('nav.users'),       href: '/dashboard/users',              icon: 'U', badge: '',     exact: false },
  ]

  useEffect(() => { loadUser() }, [])

  async function loadUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('full_name, email, organisation_id').eq('id', user.id).single()
    if (profile) {
      setUserName(profile.full_name ?? profile.email ?? '')
      setUserEmail(profile.email ?? '')
      const now = new Date()
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
      const [{ count: woCount }, { count: pmCount }] = await Promise.all([
        supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('organisation_id', profile.organisation_id).not('status', 'in', '("completed","closed")'),
        supabase.from('pm_schedules').select('id', { count: 'exact', head: true }).eq('organisation_id', profile.organisation_id).eq('is_active', true).lte('next_due_at', endOfDay),
      ])
      setOpenWOs(woCount ?? 0)
      setPmDue(pmCount ?? 0)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function isActive(item: { href: string; exact: boolean }) {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  function getBadgeCount(badge: string) {
    if (badge === 'open') return openWOs
    if (badge === 'due') return pmDue
    return 0
  }

  const sidebarStyle: React.CSSProperties = {
    width: collapsed ? 56 : 220,
    minHeight: '100vh',
    background: '#1a1a2e',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 0.2s ease',
    position: 'sticky',
    top: 0,
    flexShrink: 0,
    direction: 'ltr',
  }

  const navItemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: collapsed ? 0 : 10,
    padding: collapsed ? '10px 0' : '9px 14px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 8,
    margin: '1px 8px',
    background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
    color: active ? 'white' : 'rgba(255,255,255,0.6)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
  })

  return (
    <div style={sidebarStyle}>
      <div style={{ padding: collapsed ? '1rem 0' : '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between' }}>
        {!collapsed && (
          <div>
            <p style={{ color: 'white', fontWeight: 700, fontSize: 15, margin: 0 }}>Serviq FM</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '2px 0 0' }}>Facility Management</p>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: 6, cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>
          {collapsed ? '>' : '<'}
        </button>
      </div>

      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
        {navItems.map(item => {
          const active = isActive(item)
          const badgeCount = getBadgeCount(item.badge)
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={navItemStyle(active)}>
                <span style={{ fontSize: 14, minWidth: 20, textAlign: 'center', fontWeight: 600, color: active ? 'white' : 'rgba(255,255,255,0.5)' }}>{item.icon}</span>
                {!collapsed && (
                  <>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {badgeCount > 0 && (
                      <span style={{ background: '#e53e3e', color: 'white', borderRadius: 10, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>{badgeCount}</span>
                    )}
                  </>
                )}
                {collapsed && badgeCount > 0 && (
                  <span style={{ position: 'absolute' as const, top: 4, right: 4, background: '#e53e3e', color: 'white', borderRadius: '50%', fontSize: 9, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{badgeCount}</span>
                )}
              </div>
            </Link>
          )
        })}

        {!collapsed && (
          <div style={{ margin: '8px 16px', padding: '6px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 6 }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: 0, letterSpacing: 1 }}>COMING SOON</p>
          </div>
        )}
      </nav>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: collapsed ? '1rem 0' : '1rem' }}>
        <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
          <LanguageToggle minimal />
        </div>
        {!collapsed && (
          <div>
            <p style={{ fontSize: 13, color: 'white', fontWeight: 500, margin: '0 0 2px' }}>{userName || 'User'}</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</p>
            <button onClick={handleSignOut} style={{ width: '100%', padding: '7px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', borderRadius: 7, cursor: 'pointer', fontSize: 12 }}>
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}"""

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Sidebar completely rewritten')