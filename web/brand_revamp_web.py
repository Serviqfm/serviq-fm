import os, shutil

# ── 1. Copy logo files from local uploads ──
os.makedirs('public', exist_ok=True)
# Copy logos manually - check if they exist in common locations
logo_src = r'C:\Users\maazj\Desktop\serviq-fm\web\public'
# Logo files should be placed manually in public/ folder
# For now skip and proceed with CSS/sidebar updates
print('Skipping logo copy - place ServiqFM_Logo_v2.png and ServiqFM_Icon_v2.png in web/public/ manually')
# ── 2. Update global CSS with brand tokens ──
tokens_css = """/* ServiqFM Brand Design System v2.0 */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=Readex+Pro:wght@200;300;400;500;600;700&display=swap');

:root {
  --color-navy:          #1E2D4E;
  --color-navy-light:    #E8ECF2;
  --color-teal:          #6DCFB0;
  --color-teal-mid:      #3AAECC;
  --color-teal-light:    #B8DDD8;
  --color-teal-bg:       #E8F7F3;
  --color-blue:          #1A7FC1;
  --color-blue-light:    #E6F1FB;
  --color-muted:         #A0B0BF;
  --color-offwhite:      #F8FAFC;
  --gradient-brand:      linear-gradient(135deg, #6DCFB0 0%, #3AAECC 50%, #1A7FC1 100%);
  --gradient-brand-h:    linear-gradient(90deg, #6DCFB0 0%, #3AAECC 50%, #1A7FC1 100%);
  --color-success:       #22C997;
  --color-success-light: #E8F7F3;
  --color-success-text:  #0F6E56;
  --color-warning:       #F5A623;
  --color-warning-light: #FFF4E0;
  --color-warning-text:  #854F0B;
  --color-danger:        #E24B4A;
  --color-danger-light:  #FCEBEB;
  --color-danger-text:   #A32D2D;
  --color-info:          #1A7FC1;
  --color-info-light:    #E6F1FB;
  --color-info-text:     #185FA5;
  --color-text-primary:  #1E2D4E;
  --color-text-secondary:#4A5568;
  --color-text-muted:    #A0B0BF;
  --color-border:        #E8ECF0;
  --color-border-medium: #D0D8E0;
  --color-bg:            #FFFFFF;
  --color-bg-secondary:  #F8FAFC;
  --color-bg-tertiary:   #F1F4F6;
  --font-en:   'DM Sans', ui-sans-serif, system-ui, sans-serif;
  --font-ar:   'Readex Pro', ui-sans-serif, system-ui, sans-serif;
  --radius-input: 4px;
  --radius-btn:   8px;
  --radius-card:  12px;
  --radius-modal: 16px;
  --radius-pill:  24px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

html {
  font-family: var(--font-en);
  color: var(--color-text-primary);
  background: var(--color-bg-secondary);
  -webkit-font-smoothing: antialiased;
}

[dir="rtl"], [lang="ar"] {
  font-family: var(--font-ar);
}

body { font-family: var(--font-en); }

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--color-bg-secondary); }
::-webkit-scrollbar-thumb { background: var(--color-teal-light); border-radius: 3px; }

/* Focus rings */
*:focus-visible { outline: 2px solid var(--color-teal-mid); outline-offset: 2px; }

/* Transitions */
button, a { transition: all 0.15s ease; }
"""

os.makedirs('src/app', exist_ok=True)
# Find globals.css
for path in ['src/app/globals.css', 'src/styles/globals.css', 'styles/globals.css']:
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as f:
            existing = f.read()
        # Prepend our tokens
        with open(path, 'w', encoding='utf-8') as f:
            f.write(tokens_css + '\n' + existing)
        print(f'Updated {path}')
        break

# ── 3. Rewrite Sidebar with brand colors ──
sidebar_content = """'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import LanguageToggle from './LanguageToggle'
import Image from 'next/image'

const navItems = [
  { key: 'D', href: '/dashboard',           labelKey: 'nav.dashboard',    icon: '⊞' },
  { key: 'W', href: '/dashboard/work-orders', labelKey: 'nav.work_orders', icon: '📋' },
  { key: 'A', href: '/dashboard/assets',    labelKey: 'nav.assets',        icon: '🔧' },
  { key: 'P', href: '/dashboard/pm-schedules', labelKey: 'nav.pm',         icon: '🗓' },
  { key: 'S', href: '/dashboard/sites',     labelKey: 'nav.sites',         icon: '📍' },
  { key: 'N', href: '/dashboard/vendors',   labelKey: 'nav.vendors',       icon: '🤝' },
  { key: 'I', href: '/dashboard/inspections', labelKey: 'nav.inspections', icon: '✓' },
  { key: 'V', href: '/dashboard/inventory', labelKey: 'nav.inventory',     icon: '📦' },
  { key: 'U', href: '/dashboard/users',     labelKey: 'nav.users',         icon: '👥' },
  { key: '⚙', href: '/dashboard/settings', labelKey: 'nav.settings',      icon: '⚙' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { t, lang } = useLanguage()
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [woBadge, setWoBadge] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    loadUser()
  }, [])

  async function loadUser() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: profile } = await supabase.from('users')
      .select('*, organisation:organisation_id(name)')
      .eq('id', authUser.id).single()
    if (profile) {
      setUser(profile)
      // Load WO badge
      const { count } = await supabase.from('work_orders')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', profile.organisation_id)
        .not('status', 'in', '("completed","closed")')
      if (count) setWoBadge(count)
    }
  }

  return (
    <aside style={{
      width: collapsed ? 64 : 240,
      minHeight: '100vh',
      background: 'var(--color-navy)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.2s ease',
      flexShrink: 0,
      position: 'sticky',
      top: 0,
      height: '100vh',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 72 }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>S</span>
            </div>
            <div>
              <div style={{ color: 'white', fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>
                <span style={{ color: 'white' }}>Serviq</span>
                <span style={{ color: 'var(--color-teal)' }}>FM</span>
              </div>
              <div style={{ color: 'var(--color-muted)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 1 }}>
                {lang === 'ar' ? 'إدارة المنشآت' : 'Facility Management'}
              </div>
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
            <span style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>S</span>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Nav Items */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {navItems.map(item => {
          const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
          const label = t(item.labelKey)
          const isWO = item.key === 'W'
          return (
            <Link key={item.key} href={item.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '10px 0' : '9px 10px',
                borderRadius: 8, cursor: 'pointer',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: isActive ? 'rgba(109,207,176,0.15)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--color-teal)' : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                <span style={{ fontSize: 16, opacity: isActive ? 1 : 0.6, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && (
                  <span style={{
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--color-teal)' : 'rgba(255,255,255,0.75)',
                    flex: 1, direction: lang === 'ar' ? 'rtl' : 'ltr',
                    fontFamily: lang === 'ar' ? 'var(--font-ar)' : 'var(--font-en)',
                  }}>{label}</span>
                )}
                {!collapsed && isWO && woBadge > 0 && (
                  <span style={{ background: 'var(--color-danger)', color: 'white', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, minWidth: 18, textAlign: 'center' }}>
                    {woBadge > 99 ? '99+' : woBadge}
                  </span>
                )}
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {user && !collapsed && (
          <div style={{ padding: '10px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: 'white', fontSize: 11, fontWeight: 700 }}>{user.full_name?.[0]?.toUpperCase() ?? 'U'}</span>
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ color: 'white', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name}</div>
                <div style={{ color: 'var(--color-muted)', fontSize: 10 }}>{user.email}</div>
              </div>
            </div>
          </div>
        )}
        <div style={{ padding: '0 2px' }}>
          <LanguageToggle />
        </div>
        <form action='/auth/logout' method='post'>
          <button type='submit' style={{ width: '100%', marginTop: 6, padding: collapsed ? '8px' : '8px 10px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', borderRadius: 6, fontSize: 12, textAlign: collapsed ? 'center' : 'left', display: 'flex', alignItems: 'center', gap: 8, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <span>⎋</span>
            {!collapsed && <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>}
          </button>
        </form>
      </div>
    </aside>
  )
}
"""

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(sidebar_content)
print('Sidebar rewritten with brand colors')

print('\\nBrand revamp step 1 complete. Now run npm run dev to check.')