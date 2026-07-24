'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

// FM-26 permit-to-work list. A permit authorises hazardous work tied to a WO.
// Lifecycle: draft → requested → approved → active → closed (rejected terminal).
export default function PermitsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [permits, setPermits] = useState<any[]>([])
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
    const { data } = await supabase.from('work_permits')
      .select('*, work_order:work_order_id(title), requester:requested_by(full_name)')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false })
    if (data) setPermits(data)
    setLoading(false)
  }

  const statusBadge = (status: string) => {
    const cfg: Record<string, { className: string; en: string; ar: string }> = {
      draft:     { className: 'bg-surface-container-low text-on-surface-variant', en: 'Draft',     ar: 'مسودة' },
      requested: { className: 'bg-[#f57f17]/10 text-[#f57f17]',                   en: 'Requested', ar: 'مطلوب' },
      approved:  { className: 'bg-blue-50 text-blue-700',                         en: 'Approved',  ar: 'معتمد' },
      active:    { className: 'bg-primary/10 text-primary',                       en: 'Active',    ar: 'نشط' },
      closed:    { className: 'bg-surface-container-low text-on-surface-variant', en: 'Closed',    ar: 'مغلق' },
      rejected:  { className: 'bg-error/10 text-error',                           en: 'Rejected',  ar: 'مرفوض' },
    }
    const c = cfg[status] ?? { className: 'bg-surface-container-low text-on-surface-variant', en: status, ar: status }
    return <span className={`${c.className} px-2.5 py-0.5 rounded-full text-xs font-medium`}>{lang === 'ar' ? c.ar : c.en}</span>
  }

  const typeLabel = (type: string) => {
    const map: Record<string, { en: string; ar: string }> = {
      hot_work:        { en: 'Hot Work',        ar: 'أعمال ساخنة' },
      confined_space:  { en: 'Confined Space',  ar: 'مكان محصور' },
      electrical:      { en: 'Electrical',      ar: 'كهربائي' },
      working_at_height: { en: 'Working at Height', ar: 'العمل على ارتفاع' },
      excavation:      { en: 'Excavation',      ar: 'حفر' },
      general:         { en: 'General',         ar: 'عام' },
    }
    const m = map[type]
    return m ? (lang === 'ar' ? m.ar : m.en) : type
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-on-surface m-0">{lang === 'ar' ? 'تصاريح العمل' : 'Work Permits'}</h1>
            <p className="text-sm text-on-surface-variant mt-1 mb-0">
              {permits.length} {lang === 'ar' ? 'تصريح' : 'permits'}
            </p>
          </div>
          <Link href='/dashboard/permits/new'>
            <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
              + {lang === 'ar' ? 'تصريح جديد' : 'New Permit'}
            </button>
          </Link>
        </div>

        {loading ? (
          <p className="text-on-surface-variant">{lang === 'ar' ? 'جار التحميل...' : 'Loading...'}</p>
        ) : permits.length === 0 ? (
          <p className="text-on-surface-variant text-center py-12">{lang === 'ar' ? 'لا توجد تصاريح بعد' : 'No permits yet'}</p>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  {[
                    lang === 'ar' ? 'النوع' : 'Type',
                    lang === 'ar' ? 'أمر العمل' : 'Work Order',
                    lang === 'ar' ? 'مقدم الطلب' : 'Requested By',
                    lang === 'ar' ? 'صالح من' : 'Valid From',
                    lang === 'ar' ? 'صالح إلى' : 'Valid To',
                    lang === 'ar' ? 'الحالة' : 'Status',
                    lang === 'ar' ? 'إجراءات' : 'Actions',
                  ].map(h => (
                    <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permits.map((p) => (
                  <tr key={p.id} className="bg-surface-container-lowest hover:bg-surface-container-low transition-colors border-b border-outline-variant/50">
                    <td className="px-4 py-3 text-sm font-medium text-primary">{typeLabel(p.permit_type)}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{p.work_order?.title ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{p.requester?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{p.valid_from ? format(new Date(p.valid_from), 'dd MMM yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{p.valid_to ? format(new Date(p.valid_to), 'dd MMM yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-sm">{statusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={'/dashboard/permits/' + p.id}>
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
