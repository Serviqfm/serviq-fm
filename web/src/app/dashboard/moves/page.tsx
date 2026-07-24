'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

// MKT-25 space & move management list. A move relocates an occupant or asset
// between spaces. Lifecycle: requested → approved → scheduled → completed (rejected terminal).
export default function MovesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [moves, setMoves] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const { lang } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data } = await supabase.from('space_moves')
      .select('*, from_space:from_space_id(name), to_space:to_space_id(name), requester:requested_by(full_name)')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false })
    if (data) setMoves(data)
    setLoading(false)
  }

  const statusBadge = (status: string) => {
    const cfg: Record<string, { className: string; en: string; ar: string }> = {
      requested: { className: 'bg-[#f57f17]/10 text-[#f57f17]',                   en: 'Requested', ar: 'مطلوب' },
      approved:  { className: 'bg-blue-50 text-blue-700',                         en: 'Approved',  ar: 'معتمد' },
      scheduled: { className: 'bg-primary/10 text-primary',                       en: 'Scheduled', ar: 'مجدول' },
      completed: { className: 'bg-green-50 text-green-700',                       en: 'Completed', ar: 'مكتمل' },
      rejected:  { className: 'bg-error/10 text-error',                           en: 'Rejected',  ar: 'مرفوض' },
    }
    const c = cfg[status] ?? { className: 'bg-surface-container-low text-on-surface-variant', en: status, ar: status }
    return <span className={`${c.className} px-2.5 py-0.5 rounded-full text-xs font-medium`}>{lang === 'ar' ? c.ar : c.en}</span>
  }

  const subjectLabel = (type: string) =>
    type === 'asset' ? (lang === 'ar' ? 'أصل' : 'Asset') : (lang === 'ar' ? 'شاغل' : 'Occupant')

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-on-surface m-0">{lang === 'ar' ? 'طلبات النقل' : 'Move Requests'}</h1>
            <p className="text-sm text-on-surface-variant mt-1 mb-0">
              {moves.length} {lang === 'ar' ? 'طلب' : 'moves'}
            </p>
          </div>
          <Link href='/dashboard/moves/new'>
            <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
              + {lang === 'ar' ? 'نقل جديد' : 'New Move'}
            </button>
          </Link>
        </div>

        {loading ? (
          <p className="text-on-surface-variant">{lang === 'ar' ? 'جار التحميل...' : 'Loading...'}</p>
        ) : moves.length === 0 ? (
          <p className="text-on-surface-variant text-center py-12">{lang === 'ar' ? 'لا توجد طلبات نقل بعد' : 'No move requests yet'}</p>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  {[
                    lang === 'ar' ? 'الموضوع' : 'Subject',
                    lang === 'ar' ? 'النوع' : 'Type',
                    lang === 'ar' ? 'من' : 'From',
                    lang === 'ar' ? 'إلى' : 'To',
                    lang === 'ar' ? 'مقدم الطلب' : 'Requested By',
                    lang === 'ar' ? 'الحالة' : 'Status',
                    lang === 'ar' ? 'إجراءات' : 'Actions',
                  ].map(h => (
                    <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id} className="bg-surface-container-lowest hover:bg-surface-container-low transition-colors border-b border-outline-variant/50">
                    <td className="px-4 py-3 text-sm font-medium text-primary">{m.subject_label || '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{subjectLabel(m.subject_type)}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{m.from_space?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{m.to_space?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{m.requester?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">{statusBadge(m.status)}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={'/dashboard/moves/' + m.id}>
                        <button className="px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest cursor-pointer text-[11px] hover:bg-surface-container-low transition-colors">{lang === 'ar' ? 'عرض' : 'View'}</button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
