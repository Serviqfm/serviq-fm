'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { format } from 'date-fns'
import { usePagination } from '@/lib/usePagination'
import Pagination from '@/components/Pagination'

function statusBadgeClass(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-[#f57f17]/10 text-[#f57f17] border border-[#f57f17]/20'
    case 'approved':
      return 'bg-primary/10 text-primary border border-primary/20'
    case 'rejected':
      return 'bg-error/10 text-error border border-error/20'
    default:
      return 'bg-surface-container-low text-on-surface-variant border border-outline-variant'
  }
}

export default function RequestsPage() {
  const [tab, setTab] = useState<'all'|'pending'|'approved'|'rejected'>('all')
  const [orgId, setOrgId] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
      if (profile) setOrgId(profile.organisation_id)
    })
  }, [supabase])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { rows: filtered, total, loading, page, pageCount, from, to, hasPrev, hasNext, prev, next } = usePagination<any>(
    () => {
      let q = supabase
        .from('requests')
        .select('*, site:site_id(name), space:space_id(name, floor), work_order:work_order_id(wo_number)', { count: 'exact' })
        .eq('organisation_id', orgId!)
        .order('status')
        .order('created_at', { ascending: false })
      if (tab !== 'all') q = q.eq('status', tab)
      return q
    },
    [orgId, tab],
  )

  // Whole-org pending count for the badge (independent of the current tab/page).
  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    supabase.from('requests').select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId).eq('status', 'pending')
      .then(({ count }) => { if (!cancelled) setPendingCount(count ?? 0) })
    return () => { cancelled = true }
  }, [orgId, total, supabase])

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1100px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-3xl font-bold text-on-surface">Requests</h1>
              {pendingCount > 0 && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#f57f17]/10 text-[#f57f17] border border-[#f57f17]/20">
                  {pendingCount} pending
                </span>
              )}
            </div>
            <p className="text-on-surface-variant mt-1 text-sm">Occupant maintenance requests</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-outline-variant">
          {(['all','pending','approved','rejected'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                'px-[18px] py-2 text-sm border-b-2 -mb-px transition-colors',
                tab === t
                  ? 'font-semibold text-on-surface border-primary'
                  : 'font-normal text-on-surface-variant border-transparent hover:text-on-surface',
              ].join(' ')}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}{t === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <p className="text-on-surface-variant">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant">
            <p className="text-lg">No {tab === 'all' ? '' : tab} requests</p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant">
                  {['Requester','Site','Space','Category','Submitted','Status',''].map(h => (
                    <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap text-left">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(req => (
                  <tr key={req.id} className="hover:bg-surface-container-low transition-colors border-b border-outline-variant last:border-b-0">
                    <td className="px-4 py-3 text-sm text-on-surface-variant align-middle">
                      <div className="font-semibold text-on-surface">{req.requester_name}</div>
                      <div className="text-xs text-on-surface-variant">{req.requester_email}</div>
                      <div className="text-xs text-on-surface-variant mt-0.5">{req.title}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant align-middle">
                      {(req.site as { name: string } | null)?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant align-middle">
                      {req.space ? `${(req.space as { name: string; floor: string }).name} (${(req.space as { name: string; floor: string }).floor})` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant align-middle">{req.category}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant align-middle whitespace-nowrap">
                      {format(new Date(req.created_at), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm align-middle">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass(req.status)}`}>
                        {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                      </span>
                      {(req.work_order as { wo_number: number } | null)?.wo_number && (
                        <div className="text-[11px] text-on-surface-variant mt-0.5">
                          WO-{String((req.work_order as { wo_number: number }).wo_number).padStart(4, '0')}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm align-middle whitespace-nowrap">
                      <Link href={`/dashboard/requests/${req.id}`} className="text-primary font-semibold text-xs hover:text-primary/80 transition-colors">
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <Pagination page={page} pageCount={pageCount} from={from} to={to} total={total}
            hasPrev={hasPrev} hasNext={hasNext} prev={prev} next={next} label="requests" />
        )}
      </div>
    </div>
  )
}
