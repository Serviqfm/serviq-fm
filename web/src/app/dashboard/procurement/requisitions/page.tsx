// web/src/app/dashboard/procurement/requisitions/page.tsx
// P1: requisition list. Mirrors purchase-orders/page.tsx (status filter tabs +
// table), bilingual per playbook §1.6.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { STATUS_CLS, statusLabel, type ReqStatus } from './statusStyles'

const FILTERS: ('all' | ReqStatus)[] = [
  'all', 'draft', 'pending_approval', 'approved', 'rejected', 'converted', 'cancelled',
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export default function RequisitionsPage() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | ReqStatus>('all')
  const [error, setError] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase
      .from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data, error: qErr } = await supabase
      .from('requisitions')
      .select('*, items:requisition_items(quantity, unit_cost)')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false })
    // Pre-migration (no table yet) this errors — say so instead of showing an
    // empty list that looks like "you have no requisitions".
    if (qErr) setError(qErr.message)
    if (data) setRows(data)
    setLoading(false)
  }

  function total(r: Row): number {
    return (r.items ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, l: any) => sum + Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0), 0)
  }

  const filtered = rows.filter(r => filter === 'all' || r.status === filter)
  const pending = rows.filter(r => r.status === 'pending_approval').length

  if (loading) return <div className="p-8 text-on-surface-variant">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-[1440px] mx-auto space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{isAr ? 'طلبات الشراء' : 'Requisitions'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {rows.length} {isAr ? 'إجمالي' : 'total'}
              {pending > 0 && (
                <span className="text-secondary mx-2">
                  · {pending} {isAr ? 'بانتظار الموافقة' : 'awaiting approval'}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/settings/procurement" title={isAr ? 'إعدادات الموافقات' : 'Approval settings'}
              className="flex items-center px-3 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-base">settings</span>
            </Link>
            <Link href="/dashboard/procurement/requisitions/new">
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">add</span>
                {isAr ? 'طلب جديد' : 'New requisition'}
              </button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
        )}

        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${filter === s
                ? 'bg-primary/10 text-primary border border-primary/40'
                : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}>
              {s === 'all' ? (isAr ? 'الكل' : 'All') : statusLabel(s, isAr)}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">edit_note</span>
            <p className="text-lg font-semibold mb-1">{isAr ? 'لا توجد طلبات شراء' : 'No requisitions'}</p>
            <p className="text-sm">
              {isAr ? 'ابدأ بطلب شراء لتمريره عبر سلسلة الموافقات.' : 'Raise one to send it through the approval chain.'}
            </p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    {[
                      isAr ? 'رقم الطلب' : 'REQ #',
                      isAr ? 'العنوان' : 'Title',
                      isAr ? 'الحالة' : 'Status',
                      isAr ? 'البنود' : 'Lines',
                      isAr ? 'الإجمالي (ر.س)' : 'Total (SAR)',
                      isAr ? 'مطلوب بحلول' : 'Needed by',
                    ].map(h => (
                      <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.map(r => (
                    <tr key={r.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-4 py-4 text-sm font-semibold whitespace-nowrap">
                        <Link href={`/dashboard/procurement/requisitions/${r.id}`} className="text-primary hover:underline">
                          #{r.requisition_number}
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-sm text-on-surface">{r.title}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLS[r.status as ReqStatus] ?? ''}`}>
                          {statusLabel(r.status as ReqStatus, isAr)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-on-surface-variant">{(r.items ?? []).length}</td>
                      <td className="px-4 py-4 text-sm text-on-surface-variant whitespace-nowrap">
                        {total(r).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-4 text-sm text-on-surface-variant whitespace-nowrap">{r.needed_by ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
