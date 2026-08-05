'use client'

import { useEffect, useRef } from 'react'

/**
 * DV-29 / MKT-12 / CORE-35 — re-run `fn` on an interval while the tab is visible,
 * so list / detail / dashboard views pick up other users' changes without a manual
 * refresh. A ref holds the latest `fn` so the interval never calls a stale closure.
 *
 * ponytail: a cheap visibility-gated poll — no realtime subscription, no new deps.
 * Swap for a per-org Supabase realtime channel if the tables get added to the
 * `supabase_realtime` publication and sub-30s freshness actually matters.
 */
export function usePollingRefresh(fn: () => void, ms = 30_000) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        ref.current()
      }
    }, ms)
    return () => clearInterval(t)
  }, [ms])
}
