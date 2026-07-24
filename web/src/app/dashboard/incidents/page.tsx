'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { SEVERITIES, STATUSES, sevLabel, statusLabel, sevClass, statusClass } from './labels'

export default function IncidentsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const ar = lang === 'ar'

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data } = await supabase.from('incidents')
      .select('*, site:site_id(name), asset:asset_id(name), reporter:reported_by(full_name)')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false })
    if (data) setIncidents(data)
    setLoading(false)
  }

  const filtered = incidents.filter(i =>
    (!severity || i.severity === severity) && (!status || i.status === status)
  )
  const openCount = incidents.filter(i => i.status === 'open' || i.status === 'investigating').length

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-on-surface m-0">{ar ? 'سجل الحوادث' : 'Incident Log'}</h1>
            <p className="text-sm text-on-surface-variant mt-1 mb-0">
              {incidents.length} {ar ? 'حادث' : 'incidents'} &middot; {openCount} {ar ? 'نشط' : 'active'}
            </p>
          </div>
          <Link href='/dashboard/incidents/new'>
            <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
              + {ar ? 'الإبلاغ عن حادث' : 'Report Incident'}
            </button>
          </Link>
        </div>

        <div className="flex gap-3 flex-wrap">
          <select value={severity} onChange={e => setSeverity(e.target.value)}
            className="border border-outline-variant rounded-xl px-3 py-2 text-sm bg-surface-container-lowest text-on-surface">
            <option value=''>{ar ? 'كل الخطورة' : 'All severities'}</option>
            {SEVERITIES.map(s => <option key={s} value={s}>{sevLabel(s, ar)}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)}
            className="border border-outline-variant rounded-xl px-3 py-2 text-sm bg-surface-container-lowest text-on-surface">
            <option value=''>{ar ? 'كل الحالات' : 'All statuses'}</option>
            {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s, ar)}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-on-surface-variant text-center py-12">{ar ? 'لا توجد حوادث' : 'No incidents'}</p>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  {[ar ? 'العنوان' : 'Title', ar ? 'الخطورة' : 'Severity', ar ? 'الحالة' : 'Status',
                    ar ? 'الموقع' : 'Site', ar ? 'الأصل' : 'Asset', ar ? 'المُبلِّغ' : 'Reported by',
                    ar ? 'التاريخ' : 'Date', t('common.actions')].map(h => (
                    <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(inc => (
                  <tr key={inc.id} className="bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-primary">{inc.title}</td>
                    <td className="px-4 py-3 text-sm"><span className={`${sevClass[inc.severity]} px-2.5 py-0.5 rounded-full text-xs font-medium`}>{sevLabel(inc.severity, ar)}</span></td>
                    <td className="px-4 py-3 text-sm"><span className={`${statusClass[inc.status]} px-2.5 py-0.5 rounded-full text-xs font-medium`}>{statusLabel(inc.status, ar)}</span></td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{inc.site?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{inc.asset?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{inc.reporter?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{inc.created_at ? format(new Date(inc.created_at), 'dd MMM yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={'/dashboard/incidents/' + inc.id}>
                        <button className="px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest cursor-pointer text-[11px] hover:bg-surface-container-low transition-colors">{t('common.view')}</button>
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
