'use client'

// CORE-15 — header notification bell + in-app alert center.
// Reads the current user's `user_notifications` feed (RLS self-scoped), shows an
// unread count, and lets them mark-read / dismiss. Rows are written server-side by
// the escalation cron (CORE-16) and the notify helpers. Polls every 60s — a bell
// doesn't need realtime; a light poll keeps the code boring and dependency-free.
// ponytail: 60s poll, swap to a Supabase realtime channel if freshness matters.

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

type Notif = {
  id: string
  type_key: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

function timeAgo(iso: string, isAr: boolean): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24)
  if (d > 0) return isAr ? `منذ ${d}ي` : `${d}d ago`
  if (h > 0) return isAr ? `منذ ${h}س` : `${h}h ago`
  if (m > 0) return isAr ? `منذ ${m}د` : `${m}m ago`
  return isAr ? 'الآن' : 'now'
}

export default function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notif[]>([])
  const ref = useRef<HTMLDivElement>(null)

  const unread = items.filter(n => !n.read_at).length

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('user_notifications')
      .select('id, type_key, title, body, link, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) setItems(data as Notif[])
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  async function markAllRead() {
    const nowISO = new Date().toISOString()
    const unreadIds = items.filter(n => !n.read_at).map(n => n.id)
    if (unreadIds.length === 0) return
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: nowISO }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('user_notifications') as any)
      .update({ read_at: nowISO }).in('id', unreadIds)
  }

  async function markRead(id: string) {
    const nowISO = new Date().toISOString()
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: nowISO } : n))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('user_notifications') as any)
      .update({ read_at: nowISO }).eq('id', id)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open) load() }}
        title={isAr ? 'الإشعارات' : 'Notifications'}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-all w-full relative ${collapsed ? 'justify-center' : ''}`}
      >
        <span className="material-symbols-outlined text-xl flex-shrink-0">notifications</span>
        {!collapsed && <span className="text-sm flex-1 text-start">{isAr ? 'الإشعارات' : 'Notifications'}</span>}
        {unread > 0 && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-error text-on-error flex-shrink-0 ${collapsed ? 'absolute top-0 end-0' : ''}`}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute bottom-full mb-2 w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-xl z-[60] ${isAr ? 'start-0' : 'end-0'}`}
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20 sticky top-0 bg-surface-container-lowest">
            <span className="text-sm font-semibold text-on-surface">{isAr ? 'الإشعارات' : 'Notifications'}</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                {isAr ? 'تعليم الكل كمقروء' : 'Mark all read'}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant">
              {isAr ? 'لا توجد إشعارات' : 'No notifications'}
            </div>
          ) : (
            items.map(n => {
              const Row = (
                <div
                  className={`px-4 py-3 border-b border-outline-variant/10 hover:bg-surface-container-low transition-colors cursor-pointer ${n.read_at ? '' : 'bg-primary/5'}`}
                  onClick={() => { if (!n.read_at) markRead(n.id) }}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm truncate ${n.read_at ? 'text-on-surface-variant' : 'text-on-surface font-semibold'}`}>{n.title}</div>
                      {n.body && <div className="text-xs text-on-surface-variant line-clamp-2 mt-0.5">{n.body}</div>}
                      <div className="text-[10px] text-on-surface-variant/70 mt-1">{timeAgo(n.created_at, isAr)}</div>
                    </div>
                  </div>
                </div>
              )
              return n.link
                ? <a key={n.id} href={n.link} onClick={() => markRead(n.id)}>{Row}</a>
                : <div key={n.id}>{Row}</div>
            })
          )}
        </div>
      )}
    </div>
  )
}
