'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: 'D', exact: true, badge: '' },
  { label: 'Work Orders', href: '/dashboard/work-orders', icon: 'W', badge: 'open', exact: false },
  { label: 'Assets', href: '/dashboard/assets', icon: 'A', badge: '', exact: false },
  { label: 'PM Schedules', href: '/dashboard/pm-schedules', icon: 'P', badge: 'due', exact: false },
  { label: 'Sites', href: '/dashboard/sites', icon: 'S', badge: '', exact: false },
  { label: 'Vendors', href: '/dashboard/vendors', icon: 'N', badge: '', exact: false },
]

const soonItems = [
  { label: 'Inspections', icon: 'I' },
  { label: 'Inventory', icon: 'V' },

]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [openWOs, setOpenWOs] = useState(0)
  const [duePMs, setDuePMs] = useState(0)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserEmail(user.email ?? '')
    const { data: profile } = await supabase.from('users').select('full_name, organisation_id').eq('id', user.id).single()
    if (!profile) return
    setUserName(profile.full_name ?? '')
    const orgId = profile.organisation_id
    const [{ data: wos }, { data: pms }] = await Promise.all([
      supabase.from('work_orders').select('id').eq('organisation_id', orgId).neq('status', 'completed').neq('status', 'closed'),
      supabase.from('pm_schedules').select('id').eq('organisation_id', orgId).eq('is_active', true).lte('next_due_at', new Date().toISOString()),
    ])
    setOpenWOs(wos?.length ?? 0)
    setDuePMs(pms?.length ?? 0)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isActive = (item: any) => item.exact ? pathname === item.href : pathname.startsWith(item.href)
  const w = collapsed ? 64 : 240

  return (
    <div style={{ width: w, minHeight: '100vh', background: '#1a1a2e', display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease', flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
      <div style={{ padding: collapsed ? '1.25rem 0' : '1.25rem 1rem', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {!collapsed && (
          <div>
            <p style={{ color: 'white', fontWeight: 700, fontSize: 16, margin: 0 }}>Serviq FM</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '2px 0 0' }}>Facility Management</p>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
          {collapsed ? '>' : '<'}
        </button>
      </div>

      <nav style={{ flex: 1, padding: '0.75rem 0', overflowY: 'auto' }}>
        {navItems.map(item => {
          const active = isActive(item)
          const badge = item.badge === 'open' ? openWOs : item.badge === 'due' ? duePMs : 0
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px 0' : '10px 1rem', justifyContent: collapsed ? 'center' : 'flex-start', background: active ? 'rgba(255,255,255,0.12)' : 'transparent', borderLeft: active ? '3px solid white' : '3px solid transparent' }}>
                <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0, color: active ? 'white' : 'rgba(255,255,255,0.6)' }}>{item.icon}</span>
                {!collapsed && (
                  <>
                    <span style={{ fontSize: 13, color: active ? 'white' : 'rgba(255,255,255,0.7)', flex: 1, fontWeight: active ? 500 : 400 }}>{item.label}</span>
                    {badge > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: 'white', background: '#c62828', padding: '1px 7px', borderRadius: 10 }}>{badge}</span>}
                  </>
                )}
              </div>
            </Link>
          )
        })}
        {!collapsed && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', padding: '1rem 1rem 0.5rem', margin: 0 }}>COMING SOON</p>}
        {soonItems.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: collapsed ? '10px 0' : '10px 1rem', justifyContent: collapsed ? 'center' : 'flex-start', opacity: 0.35, cursor: 'not-allowed' }}>
            <span style={{ fontSize: 14, width: 20, textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>{item.icon}</span>
            {!collapsed && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{item.label}</span>}
          </div>
        ))}
      </nav>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: collapsed ? '1rem 0' : '1rem' }}>
        {!collapsed && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 13, color: 'white', fontWeight: 500, margin: '0 0 2px' }}>{userName || 'User'}</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</p>
          </div>
        )}
        <button onClick={handleSignOut} style={{ width: '100%', padding: collapsed ? '8px 0' : '8px 12px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', borderRadius: 6, fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 8 }}>
          <span>exit</span>
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </div>
  )
}