'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { DIRECTIONS, STATUSES, dirLabel, statusLabel, statusClass } from './labels'

export default function HandoversPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [direction, setDirection] = useState('')
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
    const { data } = await supabase.from('unit_handovers')
      .select('*, site:site_id(name)')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false })
    if (data) setRows(data)
    setLoading(false)
  }

  const filtered = rows.filter(r =>
    (!direction || r.direction === direction) && (!status || r.status === status)
  )
  const openCount = rows.filter(r => r.status !== 'completed').length

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-on-surface m-0">{ar ? 'تسليم الوحدات' : 'Unit Handovers'}</h1>
            <p className="text-sm text-on-surface-variant mt-1 mb-0">
              {rows.length} {ar ? 'تسليم' : 'handovers'} &middot; {openCount} {ar ? 'مفتوح' : 'open'}
            </p>
          </div>
          <Link href='/dashboard/handovers/new'>
            <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
              + {ar ? 'تسليم جديد' : 'New Handover'}
            </button>
          </Link>
        </div>

        <div className="flex gap-3 flex-wrap">
          <select value={direction} onChange={e => setDirection(e.target.value)}
            className="border border-outline-variant rounded-xl px-3 py-2 text-sm bg-surface-container-lowest text-on-surface">
            <option value=''>{ar ? 'كل الأنواع' : 'All directions'}</option>
            {DIRECTIONS.map(d => <option key={d} value={d}>{dirLabel(d, ar)}</option>)}
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
          <p className="text-on-surface-variant text-center py-12">{ar ? 'لا توجد عمليات تسليم' : 'No handovers'}</p>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  {[ar ? 'الوحدة' : 'Unit', ar ? 'النوع' : 'Direction', ar ? 'الحالة' : 'Status',
                    ar ? 'الساكن' : 'Occupant', ar ? 'الموقع' : 'Site',
                    ar ? 'التاريخ' : 'Date', t('common.actions')].map(h => (
                    <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-primary">{r.unit_label}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{dirLabel(r.direction, ar)}</td>
                    <td className="px-4 py-3 text-sm"><span className={`${statusClass[r.status]} px-2.5 py-0.5 rounded-full text-xs font-medium`}>{statusLabel(r.status, ar)}</span></td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{r.occupant_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{r.site?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{r.created_at ? format(new Date(r.created_at), 'dd MMM yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <Link href={'/dashboard/handovers/' + r.id}>
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
