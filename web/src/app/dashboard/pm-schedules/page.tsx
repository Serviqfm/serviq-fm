'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isPast } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

export default function PMSchedulesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const { t, lang } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSchedules() }, [])

  async function fetchSchedules() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pm_schedules')
      .select('*, asset:asset_id(name), site:site_id(name), assignee:assigned_to(full_name)')
      .order('next_due_at', { ascending: true })
    if (!error && data) setSchedules(data)
    setLoading(false)
  }

  function calculateNextDue(frequency: string): string {
    const now = new Date()
    switch (frequency) {
      case 'daily':       now.setDate(now.getDate() + 1); break
      case 'weekly':      now.setDate(now.getDate() + 7); break
      case 'fortnightly': now.setDate(now.getDate() + 14); break
      case 'monthly':     now.setMonth(now.getMonth() + 1); break
      case 'quarterly':   now.setMonth(now.getMonth() + 3); break
      case 'biannual':    now.setMonth(now.getMonth() + 6); break
      case 'annual':      now.setFullYear(now.getFullYear() + 1); break
      default:            now.setMonth(now.getMonth() + 1)
    }
    return now.toISOString()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function generateWorkOrder(schedule: any) {
    setGenerating(schedule.id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGenerating(null); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setGenerating(null); return }
    const { error } = await supabase.from('work_orders').insert({
      title: schedule.title,
      description: schedule.description || null,
      priority: 'medium',
      status: schedule.assigned_to ? 'assigned' : 'new',
      source: 'pm_schedule',
      asset_id: schedule.asset_id || null,
      site_id: schedule.site_id || null,
      assigned_to: schedule.assigned_to || null,
      organisation_id: profile.organisation_id,
      created_by: user.id,
    })
    if (!error) {
      await supabase.from('pm_schedules').update({
        last_completed_at: new Date().toISOString(),
        last_generated_at: new Date().toISOString(),
        next_due_at: calculateNextDue(schedule.frequency),
      }).eq('id', schedule.id)
      fetchSchedules()
    }
    setGenerating(null)
  }

  async function deleteSelected() {
    if (!confirm(selected.length + ' schedule(s)?')) return
    setDeleting(true)
    await supabase.from('pm_schedules').delete().in('id', selected)
    setSelected([])
    await fetchSchedules()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('pm_schedules').delete().eq('id', id)
    fetchSchedules()
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelected(prev => prev.length === schedules.length ? [] : schedules.map(s => s.id))
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('pm_schedules').update({ is_active: !current }).eq('id', id)
    fetchSchedules()
  }

  const freqLabel: Record<string, string> = {
    daily:       lang === 'ar' ? 'يومي'        : 'Daily',
    weekly:      lang === 'ar' ? 'أسبوعي'      : 'Weekly',
    fortnightly: lang === 'ar' ? 'كل أسبوعين'  : 'Fortnightly',
    monthly:     lang === 'ar' ? 'شهري'        : 'Monthly',
    quarterly:   lang === 'ar' ? 'ربع سنوي'    : 'Quarterly',
    biannual:    lang === 'ar' ? 'كل 6 أشهر'   : 'Every 6 Months',
    annual:      lang === 'ar' ? 'سنوي'        : 'Annual',
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDue = (s: any) => s.next_due_at && isPast(new Date(s.next_due_at))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDueSoon = (s: any) => {
    if (!s.next_due_at) return false
    const days = Math.ceil((new Date(s.next_due_at).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 7
  }

  const stats = {
    total:  schedules.length,
    active: schedules.filter(s => s.is_active).length,
    due:    schedules.filter(s => s.is_active && isDue(s)).length,
    soon:   schedules.filter(s => s.is_active && isDueSoon(s) && !isDue(s)).length,
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('pm.title')}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {stats.total} {t('pm.title').toLowerCase()} · {stats.active} {t('common.active').toLowerCase()}
              {stats.due > 0 && <span className="text-error ml-1">· {stats.due} {lang === 'ar' ? 'متأخر' : 'overdue'}</span>}
              {stats.soon > 0 && <span className="text-[#f57f17] ml-1">· {stats.soon} {lang === 'ar' ? 'قريباً' : 'due soon'}</span>}
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/dashboard/pm-schedules/calendar">
              <button className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">
                {t('pm.calendar')}
              </button>
            </Link>
            <Link href="/dashboard/pm-schedules/compliance">
              <button className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">
                {t('pm.compliance')}
              </button>
            </Link>
            <Link href="/dashboard/pm-schedules/new">
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">add</span>{t('pm.new')}
              </button>
            </Link>
          </div>
        </div>

        {/* Stats bento */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: lang === 'ar' ? 'إجمالي الجداول' : 'Total Schedules', value: stats.total,  icon: 'event_repeat',    color: 'text-primary',    decor: 'bg-primary/5' },
            { label: lang === 'ar' ? 'نشطة'            : 'Active',          value: stats.active, icon: 'check_circle',    color: 'text-primary',    decor: 'bg-primary/5' },
            { label: lang === 'ar' ? 'متأخرة'          : 'Overdue',         value: stats.due,    icon: 'warning',         color: 'text-error',      decor: 'bg-error/5'   },
            { label: lang === 'ar' ? 'مستحقة قريباً'   : 'Due Soon',        value: stats.soon,   icon: 'schedule',        color: 'text-[#f57f17]',  decor: 'bg-[#f57f17]/5' },
          ].map(s => (
            <div key={s.label} className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group">
              <div className={`absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 rounded-full group-hover:scale-110 transition-transform duration-500 ${s.decor}`} />
              <div className={`p-2 rounded-lg w-fit mb-3 ${s.decor}`}>
                <span className={`material-symbols-outlined ${s.color}`}>{s.icon}</span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{s.label}</p>
              <p className={`text-4xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Bulk delete */}
        {selected.length > 0 && (
          <div className="bg-error/5 border border-error/20 rounded-xl p-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-error">{selected.length} {t('common.selected')}</span>
            <button onClick={deleteSelected} disabled={deleting}
              className="px-4 py-2 rounded-xl bg-error text-on-error text-sm font-semibold disabled:opacity-50 hover:bg-error/90 transition-colors">
              {deleting ? t('common.loading') : t('btn.delete_selected')}
            </button>
            <button onClick={() => setSelected([])} className="px-4 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
          </div>
        )}

        {/* Table */}
        {schedules.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">event_repeat</span>
            <p className="text-lg font-semibold mb-1">{lang === 'ar' ? 'لا توجد جداول صيانة بعد' : 'No PM schedules yet'}</p>
            <p className="text-sm">{lang === 'ar' ? 'أنشئ أول جدول صيانة وقائية للبدء' : 'Create your first preventive maintenance schedule to get started'}</p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container border-b border-outline-variant/30">
                    <th className="p-3 w-10">
                      <input type="checkbox" checked={selected.length === schedules.length && schedules.length > 0} onChange={toggleSelectAll} className="rounded" />
                    </th>
                    {[t('pm.col.title'), t('pm.col.asset'), t('pm.col.freq'), t('pm.col.compliance'), t('pm.col.due'), t('wo.col.assigned'), t('common.status'), t('common.actions')].map(h => (
                      <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {schedules.map(s => {
                    const due = isDue(s)
                    const soon = isDueSoon(s)
                    return (
                      <tr key={s.id} className={`hover:bg-surface-container-low transition-colors ${selected.includes(s.id) ? 'bg-primary/5' : due ? 'bg-error/5' : ''}`}>
                        <td className="p-3">
                          <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} className="rounded" />
                        </td>
                        <td className="p-3">
                          <Link href={'/dashboard/pm-schedules/' + s.id} className="text-sm font-semibold text-primary hover:underline">
                            {s.title}
                          </Link>
                          {s.description && (
                            <p className="text-xs text-on-surface-variant mt-0.5 max-w-[240px] truncate">{s.description}</p>
                          )}
                        </td>
                        <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{s.asset?.name ?? s.site?.name ?? '—'}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-surface-container text-on-surface-variant">
                            {freqLabel[s.frequency] ?? s.frequency}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">
                          {s.completed_count > 0 ? Math.round((s.on_time_count / s.completed_count) * 100) + '%' : '—'}
                        </td>
                        <td className={`p-3 text-sm whitespace-nowrap ${due ? 'text-error' : soon ? 'text-[#f57f17]' : 'text-on-surface-variant'}`}>
                          {s.next_due_at ? format(new Date(s.next_due_at), 'dd MMM yyyy') : '—'}
                          {due && <span className="text-[10px] block text-error font-semibold">{lang === 'ar' ? 'متأخر' : 'Overdue'}</span>}
                          {soon && !due && <span className="text-[10px] block text-[#f57f17] font-semibold">{lang === 'ar' ? 'قريباً' : 'Due soon'}</span>}
                        </td>
                        <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{s.assignee?.full_name ?? t('common.unassigned')}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.is_active ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                            {s.is_active ? t('common.active') : t('common.inactive')}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1.5 flex-wrap">
                            <button onClick={() => generateWorkOrder(s)} disabled={generating === s.id}
                              className="px-2.5 py-1 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap">
                              {generating === s.id ? '...' : (lang === 'ar' ? 'إنشاء أمر عمل' : 'Generate WO')}
                            </button>
                            <Link href={'/dashboard/pm-schedules/' + s.id + '/edit'}>
                              <button className="px-2.5 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                            </Link>
                            <button onClick={() => toggleActive(s.id, s.is_active)}
                              className="px-2.5 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors whitespace-nowrap">
                              {s.is_active ? (lang === 'ar' ? 'إيقاف' : 'Pause') : (lang === 'ar' ? 'تفعيل' : 'Resume')}
                            </button>
                            <button onClick={() => deleteOne(s.id)}
                              className="px-2.5 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">{t('common.delete')}</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
