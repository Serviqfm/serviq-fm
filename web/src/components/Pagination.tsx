// Server-side pagination controls (DV-14). Pairs with lib/usePagination.
type Props = {
  page: number
  pageCount: number
  from: number
  to: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  prev: () => void
  next: () => void
  label?: string
}

export default function Pagination({ page, pageCount, from, to, total, hasPrev, hasNext, prev, next, label = 'items' }: Props) {
  if (total === 0) return null
  return (
    <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
      <p className="text-sm text-on-surface-variant">
        {from}–{to} of {total} {label}
      </p>
      <div className="flex items-center gap-2">
        <button onClick={prev} disabled={!hasPrev}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-outline-variant/40 text-sm font-semibold text-on-surface-variant disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container-low transition-colors">
          <span className="material-symbols-outlined text-base">chevron_left</span>Prev
        </button>
        <span className="text-sm text-on-surface-variant px-1">Page {page + 1} of {pageCount}</span>
        <button onClick={next} disabled={!hasNext}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-outline-variant/40 text-sm font-semibold text-on-surface-variant disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-container-low transition-colors">
          Next<span className="material-symbols-outlined text-base">chevron_right</span>
        </button>
      </div>
    </div>
  )
}
