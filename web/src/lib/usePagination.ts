// web/src/lib/usePagination.ts
'use client'

import { useEffect, useState } from 'react'

export const PAGE_SIZE = 50

/** Pure page-window math, extracted so it's testable without a renderer. */
export function pageWindow(total: number, page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, total)
  return {
    pageCount,
    from,
    to,
    hasPrev: page > 0,
    hasNext: page + 1 < pageCount,
  }
}

/**
 * Server-side pagination for Supabase list pages (DV-14).
 *
 * The caller supplies `buildQuery`, which must return a Supabase query with all
 * filters/search/order applied but WITHOUT `.range()`. The hook adds the exact
 * count and the row range for the current page, runs it, and exposes the page
 * of rows plus prev/next controls.
 *
 * `deps` are the filter/search values: whenever they change the page resets to
 * 0 so the user isn't stranded on a page that no longer exists.
 */
export function usePagination<Row>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: () => any,
  deps: unknown[],
  pageSize = PAGE_SIZE,
) {
  const [page, setPage] = useState(0)
  const [nonce, setNonce] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Reset to first page whenever filters change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(0) }, deps)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const from = page * pageSize
    const query = buildQuery()
      .range(from, from + pageSize - 1)
    Promise.resolve(query).then(({ data, count }: { data: Row[] | null; count: number | null }) => {
      if (cancelled) return
      setRows(data ?? [])
      setTotal(count ?? 0)
      setLoading(false)
    })
    return () => { cancelled = true }
    // buildQuery is recreated each render; drive off page + caller deps instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, nonce, pageSize, ...deps])

  const win = pageWindow(total, page, pageSize)

  return {
    rows,
    total,
    loading,
    page,
    ...win,
    prev: () => setPage(p => Math.max(0, p - 1)),
    next: () => setPage(p => p + 1),
    setRows,
    /** Re-run the current page (e.g. after a delete). */
    refresh: () => setNonce(n => n + 1),
  }
}
