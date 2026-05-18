'use client'

import { useEffect, useState } from 'react'

export default function PlatformImpersonationBanner() {
  const [info, setInfo] = useState<{ org_id: string; org_name: string } | null>(null)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    // The cookie itself is HttpOnly, so we ask the server for human-readable context
    fetch('/api/impersonation/status')
      .then(r => r.json())
      .then(d => {
        if (d.impersonating && d.org_id) {
          setInfo({ org_id: d.org_id, org_name: d.org_name ?? 'Unknown' })
        }
      })
      .catch(() => {})
  }, [])

  async function exit() {
    setExiting(true)
    await fetch('/api/impersonation/exit', { method: 'POST' })
    if (typeof window !== 'undefined') {
      window.location.href = info?.org_id ? `/platform/tenants/${info.org_id}` : '/platform/tenants'
    }
  }

  if (!info) return null

  return (
    <div className="sticky top-0 z-[60] bg-error/10 border-b border-error/20 text-error text-sm py-2 px-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px]">visibility</span>
        <span>Impersonating: <strong>{info.org_name}</strong></span>
      </div>
      <button onClick={exit} disabled={exiting}
        className="px-3 py-1 rounded-lg bg-error text-white text-xs font-semibold disabled:opacity-50">
        {exiting ? 'Exiting…' : 'Exit impersonation'}
      </button>
    </div>
  )
}
