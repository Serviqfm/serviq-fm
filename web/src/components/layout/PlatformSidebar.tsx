'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Logo } from '@/components/brand/Logo'

const NAV_ITEMS = [
  { href: '/platform/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/platform/tenants',   label: 'Tenants',   icon: 'apartment' },
  { href: '/platform/announcements', label: 'Announcements', icon: 'campaign' },
  { href: '/platform/audit',     label: 'Audit Log', icon: 'history' },
  { href: '/platform/health',    label: 'Health',    icon: 'monitor_heart' },
]

export default function PlatformSidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden md:flex w-64 flex-col bg-surface-container-lowest border-r border-outline-variant sticky top-0 h-screen z-50">
      <div className="px-6 py-5 border-b border-outline-variant">
        <div className="text-xs font-bold uppercase tracking-wider text-error mb-2">Platform Admin</div>
        <Logo href="/platform/dashboard" size={140} />
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = pathname?.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={isActive
                ? 'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/10 text-primary font-semibold text-sm'
                : 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-on-surface-variant text-sm hover:bg-surface-container-low transition-colors'}>
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="px-3 py-3 border-t border-outline-variant">
        <form action="/auth/logout" method="post">
          <button type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-on-surface-variant text-sm hover:bg-error/5 hover:text-error transition-colors">
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span>Sign Out</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
