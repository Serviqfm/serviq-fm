'use client'

import { useEffect, useState } from 'react'

type Announcement = { id: string; title: string; body: string; published_at: string | null }

const DISMISS_KEY = 'dismissed_announcements'

function readDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') } catch { return [] }
}

export default function TenantAnnouncementsBanner() {
  const [items, setItems] = useState<Announcement[]>([])

  useEffect(() => {
    fetch('/api/announcements')
      .then(r => r.json())
      .then(d => {
        const dismissed = readDismissed()
        setItems((d.announcements ?? []).filter((a: Announcement) => !dismissed.includes(a.id)))
      })
      .catch(() => {})
  }, [])

  function dismiss(id: string) {
    const next = Array.from(new Set([...readDismissed(), id]))
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)) } catch { /* private mode: banner just returns next load */ }
    setItems(list => list.filter(a => a.id !== id))
  }

  if (items.length === 0) return null

  return (
    <div className="sticky top-0 z-[55]">
      {items.map(a => (
        <div key={a.id}
          className="bg-primary/10 border-b border-primary/20 text-on-surface text-sm py-2 px-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <span className="material-symbols-outlined text-[18px] text-primary mt-0.5">campaign</span>
            <span className="min-w-0"><strong>{a.title}</strong> — {a.body}</span>
          </div>
          <button onClick={() => dismiss(a.id)} aria-label="Dismiss announcement"
            className="shrink-0 text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      ))}
    </div>
  )
}
