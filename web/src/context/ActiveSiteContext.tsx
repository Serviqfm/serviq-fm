'use client'

// 1C-33: client-side "active site" convenience filter. A user picks one site
// once and the main list pages scope to it within their CURRENT org. This is a
// pure UX layer on top of RLS — NOT a security boundary. Default 'all' = today's
// behaviour, unchanged. Sites are fetched via the RLS'd client, so the list only
// ever contains sites the user can already see.

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase'

interface Site { id: string; name: string }

interface ActiveSiteContextType {
  activeSiteId: string           // 'all' or a site id
  setActiveSiteId: (id: string) => void
  sites: Site[]
}

const ActiveSiteContext = createContext<ActiveSiteContextType>({
  activeSiteId: 'all',
  setActiveSiteId: () => {},
  sites: [],
})

const STORAGE_KEY = 'serviq_active_site'

export function ActiveSiteProvider({ children }: { children: ReactNode }) {
  const [activeSiteId, setActiveSiteIdState] = useState<string>('all')
  const [sites, setSites] = useState<Site[]>([])

  // Restore persisted choice after mount (avoids SSR/hydration mismatch).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setActiveSiteIdState(stored)
    } catch { /* ignore */ }
  }, [])

  // Load the org's visible sites (RLS-scoped).
  useEffect(() => {
    let cancelled = false
    createClient().from('sites').select('id, name').order('name')
      .then(({ data }) => { if (!cancelled && data) setSites(data as Site[]) })
    return () => { cancelled = true }
  }, [])

  function setActiveSiteId(id: string) {
    setActiveSiteIdState(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* ignore */ }
  }

  return (
    <ActiveSiteContext.Provider value={{ activeSiteId, setActiveSiteId, sites }}>
      {children}
    </ActiveSiteContext.Provider>
  )
}

export function useActiveSite() {
  return useContext(ActiveSiteContext)
}
