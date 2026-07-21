'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Logo } from '@/components/brand/Logo'
import { format } from 'date-fns'

// MKT-10: aggregated history for an authenticated requester — every request THEY
// submitted (scoped by requester_email = their own email; the RLS self-scope policy
// in docs/superpowers/sql/w5-6-my-requests.sql enforces this at the DB too).

type Row = {
  id: string
  title: string
  status: string
  category: string | null
  created_at: string
  tracking_token: string
}

const STATUS: Record<string, { en: string; ar: string; cls: string }> = {
  pending:  { en: 'Pending',  ar: 'قيد الانتظار', cls: 'bg-[#f57f17]/10 text-[#f57f17] border-[#f57f17]/20' },
  approved: { en: 'Approved', ar: 'تمت الموافقة', cls: 'bg-primary/10 text-primary border-primary/20' },
  rejected: { en: 'Rejected', ar: 'مرفوض',        cls: 'bg-error/10 text-error border-error/20' },
}

export default function MyRequestsPage() {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    if (!user?.email) { setLoading(false); return }
    // Own requests only — explicit email filter on top of the self-scope RLS policy.
    const { data } = await supabase
      .from('requests')
      .select('id, title, status, category, created_at, tracking_token')
      .eq('requester_email', user.email)
      .order('created_at', { ascending: false })
    setRows((data as Row[]) ?? [])
    setLoading(false)
  }

  if (!loading && !user) return (
    <div className="star-pattern bg-background min-h-screen flex items-center justify-center p-6">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-10 max-w-sm w-full text-center shadow-sm">
        <span className="material-symbols-outlined text-primary text-4xl mb-4 block">assignment</span>
        <h2 className="text-xl font-bold text-on-surface mb-2">My Requests / طلباتي</h2>
        <p className="text-sm text-on-surface-variant mb-6">Please log in to view your requests. / يرجى تسجيل الدخول لعرض طلباتك.</p>
        <a href="/login" className="block w-full bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors text-center">Log In / تسجيل الدخول</a>
      </div>
    </div>
  )

  return (
    <div className="star-pattern bg-background text-on-surface min-h-screen flex flex-col">

      <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant/30 shadow-sm">
        <div className="flex justify-between items-center w-full px-8 max-w-[1440px] mx-auto h-16 md:h-20">
          <Logo href="/" size={140} />
          <a href="/request" className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors">New Request / طلب جديد</a>
        </div>
      </header>

      <main className="flex-grow flex flex-col items-center px-6 py-10 gap-6">
        <div className="w-full max-w-2xl">

          <div className="flex items-baseline justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-on-surface">My Requests</h1>
              <p className="text-sm text-on-surface-variant mt-0.5" style={{ fontFamily: 'Readex Pro, sans-serif' }}>طلباتي</p>
            </div>
            <a href="/request" className="bg-primary text-on-primary px-4 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center gap-1.5 shadow-sm">
              <span className="material-symbols-outlined text-base">add</span>
              New
            </a>
          </div>

          {loading ? (
            <div className="text-center py-16 text-sm text-on-surface-variant">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-12 text-center shadow-sm">
              <span className="material-symbols-outlined text-outline-variant text-5xl mb-3 block">inbox</span>
              <p className="text-sm font-semibold text-on-surface">No requests yet / لا توجد طلبات بعد</p>
              <p className="text-xs text-on-surface-variant mt-1 mb-5">Requests you submit will appear here. / ستظهر الطلبات التي ترسلها هنا.</p>
              <a href="/request" className="inline-block bg-primary text-on-primary px-6 py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors">Submit a Request / تقديم طلب</a>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map(r => {
                const s = STATUS[r.status] ?? { en: r.status, ar: '', cls: 'bg-surface-container-low text-on-surface-variant border-outline-variant' }
                return (
                  <a key={r.id} href={`/track/${r.tracking_token}`}
                    className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-5 py-4 shadow-sm hover:border-primary/40 transition-colors flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-on-surface truncate">{r.title}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {format(new Date(r.created_at), 'dd MMM yyyy')}
                        {r.category ? ` · ${r.category}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${s.cls}`}>
                      {s.en}{s.ar ? ` · ${s.ar}` : ''}
                    </span>
                  </a>
                )
              })}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
