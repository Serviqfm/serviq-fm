'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isPast } from 'date-fns'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { archiveConfirmMessage, nextDueOnDaysOfWeek } from '../pm-utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateNextDue(schedule: any): string {
  // Weekly schedules with days_of_week land on the next selected weekday
  // (mirrors /api/cron/pm-generate).
  if (schedule.frequency === 'weekly' && Array.isArray(schedule.days_of_week) && schedule.days_of_week.length > 0) {
    return nextDueOnDaysOfWeek(new Date(), schedule.days_of_week).toISOString()
  }
  const frequency: string = schedule.frequency
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

const freqLabel: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', fortnightly: 'Fortnightly',
  monthly: 'Monthly', quarterly: 'Quarterly', biannual: 'Every 6 Months', annual: 'Annual',
}

const woStatusConfig: Record<string, { className: string }> = {
  new:         { className: 'bg-[#e3f2fd] text-[#1A7FC1]' },
  assigned:    { className: 'bg-[#e8eaf6] text-[#1E2D4E]' },
  in_progress: { className: 'bg-[#fff8e1] text-[#F57F17]' },
  on_hold:     { className: 'bg-[#fce4ec] text-[#C62828]' },
  completed:   { className: 'bg-primary/10 text-primary' },
  closed:      { className: 'bg-surface-container-low text-on-surface-variant' },
}

export default function PMScheduleDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const { t, lang } = useLanguage()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [schedule, setSchedule] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'workorders'>('details')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    const [{ data: pm }, { data: wos }] = await Promise.all([
      supabase.from('pm_schedules')
        .select('*, asset:asset_id(id, name), site:site_id(name), assignee:assigned_to(full_name)')
        .eq('id', id)
        .single(),
      supabase.from('work_orders')
        .select('*, assignee:assigned_to(full_name)')
        .eq('source', 'pm_schedule')
        .order('created_at', { ascending: false }),
    ])
    if (pm) {
      setSchedule(pm)
      if (wos) {
        setWorkOrders(
          wos.filter(wo =>
            wo.title === pm.title &&
            (pm.asset_id ? wo.asset_id === pm.asset_id : wo.site_id === pm.site_id)
          )
        )
      }
    }
    setLoading(false)
  }

  async function generateWorkOrder() {
    if (!schedule || schedule.is_archived) return
    // End date passed (or next due falls beyond it): don't generate.
    if (schedule.end_date && (Date.now() > new Date(schedule.end_date).getTime() ||
        (schedule.next_due_at && new Date(schedule.next_due_at) > new Date(schedule.end_date)))) {
      alert(lang === 'ar'
        ? 'انتهى هذا الجدول — تاريخ الانتهاء قد مضى، لن يتم إنشاء أوامر عمل جديدة.'
        : 'This schedule has ended — its end date has passed, so no new work orders will be generated.')
      return
    }
    setGenerating(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGenerating(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setGenerating(false); return }
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
      const nextDue = calculateNextDue(schedule)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: any = {
        last_completed_at: new Date().toISOString(),
        last_generated_at: new Date().toISOString(),
        next_due_at: nextDue,
      }
      // Rolled past the end date: this was the last cycle — deactivate.
      if (schedule.end_date && new Date(nextDue) > new Date(schedule.end_date)) update.is_active = false
      await supabase.from('pm_schedules').update(update).eq('id', id)
      fetchAll()
    }
    setGenerating(false)
  }

  async function archiveSchedule() {
    if (!schedule || schedule.is_archived) return
    if (!confirm(archiveConfirmMessage(lang))) return
    await supabase.from('pm_schedules').update({ is_archived: true, is_active: false }).eq('id', id)
    fetchAll()
  }

  async function toggleActive() {
    if (!schedule) return
    await supabase.from('pm_schedules').update({ is_active: !schedule.is_active }).eq('id', id)
    fetchAll()
  }

  async function deleteSchedule() {
    if (!confirm('Delete this PM schedule? This cannot be undone.')) return
    await supabase.from('pm_schedules').delete().eq('id', id)
    window.location.href = '/dashboard/pm-schedules'
  }

  if (loading) return <div className="p-8 text-on-surface-variant">Loading...</div>
  if (!schedule) return <div className="p-8 text-on-surface-variant">PM Schedule not found.</div>

  const isDue = schedule.next_due_at && isPast(new Date(schedule.next_due_at))
  const complianceRate = schedule.completed_count > 0
    ? Math.round((schedule.on_time_count / schedule.completed_count) * 100)
    : null

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[900px] mx-auto space-y-6">

        <div className="flex justify-between items-center">
          <a href="/dashboard/pm-schedules" className="text-on-surface-variant text-sm hover:text-primary transition-colors">
            {lang === 'ar' ? '← رجوع' : '← Back to PM Schedules'}
          </a>
          {!schedule.is_archived && (
            <div className="flex gap-2">
              <button
                onClick={toggleActive}
                className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors"
              >
                {schedule.is_active
                  ? (lang === 'ar' ? 'إيقاف' : 'Pause')
                  : (lang === 'ar' ? 'تفعيل' : 'Resume')}
              </button>
              <button
                onClick={archiveSchedule}
                className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors"
              >
                {lang === 'ar' ? 'أرشفة' : 'Archive'}
              </button>
              <Link href={'/dashboard/pm-schedules/' + id + '/edit'}>
                <button className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">
                  {t('common.edit')}
                </button>
              </Link>
              <button
                onClick={generateWorkOrder}
                disabled={generating}
                className={`bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors${generating ? ' opacity-70' : ''}`}
              >
                {generating
                  ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Generating...')
                  : (lang === 'ar' ? 'إنشاء أمر عمل' : 'Generate Work Order')}
              </button>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[22px] font-bold text-on-surface">{schedule.title}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${schedule.is_archived ? 'bg-surface-container-low text-on-surface-variant' : schedule.is_active ? 'bg-primary/10 text-primary' : 'bg-surface-container-low text-on-surface-variant'}`}>
              {schedule.is_archived
                ? (lang === 'ar' ? 'مؤرشف' : 'Archived')
                : schedule.is_active
                  ? (lang === 'ar' ? 'نشط' : 'Active')
                  : (lang === 'ar' ? 'موقوف' : 'Paused')}
            </span>
            {isDue && schedule.is_active && !schedule.is_archived && (
              <span className="bg-error/10 text-error px-2.5 py-0.5 rounded-full text-xs font-medium">
                {lang === 'ar' ? 'متأخر' : 'Overdue'}
              </span>
            )}
          </div>
          <p className="text-sm text-on-surface-variant mt-1.5">
            {freqLabel[schedule.frequency] ?? schedule.frequency}
            {schedule.estimated_duration_minutes && ` · ${schedule.estimated_duration_minutes} min`}
            {schedule.completed_count > 0 && ` · ${schedule.completed_count} ${lang === 'ar' ? 'إتمام' : 'completions'}`}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: lang === 'ar' ? 'الموعد القادم' : 'Next Due',
              value: schedule.next_due_at ? format(new Date(schedule.next_due_at), 'dd MMM yyyy') : '—',
              alert: isDue,
            },
            {
              label: lang === 'ar' ? 'آخر إنشاء' : 'Last Generated',
              value: schedule.last_generated_at ? format(new Date(schedule.last_generated_at), 'dd MMM yyyy') : (lang === 'ar' ? 'لم يتم' : 'Never'),
            },
            {
              label: lang === 'ar' ? 'مرات الإتمام' : 'Completions',
              value: schedule.completed_count ?? 0,
            },
            {
              label: lang === 'ar' ? 'نسبة الالتزام' : 'Compliance Rate',
              value: complianceRate !== null ? complianceRate + '%' : '—',
            },
          ].map(stat => (
            <div key={stat.label} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] px-4 py-3.5">
              <p className="text-[11px] text-on-surface-variant font-semibold uppercase tracking-wider mb-1.5">{stat.label}</p>
              <p className={`text-lg font-bold ${stat.alert ? 'text-error' : 'text-on-surface'}`}>{String(stat.value)}</p>
            </div>
          ))}
        </div>

        <div className="border-b border-outline-variant flex">
          <button
            className={activeTab === 'details'
              ? 'px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary'
              : 'px-4 py-2.5 text-sm text-on-surface-variant border-b-2 border-transparent hover:text-on-surface transition-colors'}
            onClick={() => setActiveTab('details')}
          >
            {lang === 'ar' ? 'التفاصيل' : 'Details'}
          </button>
          <button
            className={activeTab === 'workorders'
              ? 'px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary'
              : 'px-4 py-2.5 text-sm text-on-surface-variant border-b-2 border-transparent hover:text-on-surface transition-colors'}
            onClick={() => setActiveTab('workorders')}
          >
            {lang === 'ar' ? `أوامر العمل (${workOrders.length})` : `Generated Work Orders (${workOrders.length})`}
          </button>
        </div>

        {activeTab === 'details' && (
          <div>
            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              {[
                { label: lang === 'ar' ? 'الأصل' : 'Asset',              value: schedule.asset?.name ?? '—' },
                { label: lang === 'ar' ? 'الموقع' : 'Site',               value: schedule.site?.name ?? '—' },
                { label: lang === 'ar' ? 'التكرار' : 'Frequency',         value: freqLabel[schedule.frequency] ?? schedule.frequency },
                { label: lang === 'ar' ? 'المعين إليه' : 'Assigned To',   value: schedule.assignee?.full_name ?? t('common.unassigned') },
                { label: lang === 'ar' ? 'المدة التقديرية' : 'Est. Duration',
                  value: schedule.estimated_duration_minutes ? schedule.estimated_duration_minutes + ' min' : '—' },
                { label: lang === 'ar' ? 'الموعد القادم' : 'Next Due',
                  value: schedule.next_due_at ? format(new Date(schedule.next_due_at), 'dd MMM yyyy HH:mm') : '—' },
                { label: lang === 'ar' ? 'تاريخ الانتهاء' : 'End Date',
                  value: schedule.end_date ? format(new Date(schedule.end_date), 'dd MMM yyyy') : '—' },
                { label: lang === 'ar' ? 'أيام الأسبوع' : 'Days of Week',
                  value: schedule.frequency === 'weekly' && Array.isArray(schedule.days_of_week) && schedule.days_of_week.length > 0
                    ? (lang === 'ar'
                        ? ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
                        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
                        .filter((_, i) => schedule.days_of_week.includes(i)).join(', ')
                    : '—' },
                { label: lang === 'ar' ? 'موسمي' : 'Seasonal',
                  value: schedule.is_seasonal
                    ? `Month ${schedule.seasonal_start_month} – ${schedule.seasonal_end_month}`
                    : (lang === 'ar' ? 'لا' : 'No') },
                { label: lang === 'ar' ? 'آخر إتمام' : 'Last Completed',
                  value: schedule.last_completed_at
                    ? format(new Date(schedule.last_completed_at), 'dd MMM yyyy')
                    : (lang === 'ar' ? 'لم يتم' : 'Never') },
              ].map(({ label, value }) => (
                <div key={label} className="bg-surface-container-low rounded-lg px-4 py-3">
                  <p className="text-xs text-on-surface-variant mb-1">{label}</p>
                  <p className="text-sm font-medium text-on-surface">{value}</p>
                </div>
              ))}
            </div>
            {schedule.description && (
              <div className="bg-surface-container-low rounded-lg px-4 py-3 mt-1">
                <p className="text-xs text-on-surface-variant mb-1.5">
                  {lang === 'ar' ? 'الوصف' : 'Description'}
                </p>
                <p className="text-sm leading-relaxed text-on-surface">{schedule.description}</p>
              </div>
            )}
            {schedule.asset && (
              <div className="mt-4">
                <Link href={'/dashboard/assets/' + schedule.asset.id} className="text-secondary text-sm hover:text-primary transition-colors">
                  {lang === 'ar' ? '→ عرض الأصل' : '→ View Asset'}
                </Link>
              </div>
            )}
            <div className="mt-6 pt-4 border-t border-outline-variant">
              <button
                onClick={deleteSchedule}
                className="bg-error/10 text-error border border-error/20 px-4 py-2 rounded-xl font-semibold text-sm hover:bg-error/20 transition-colors"
              >
                {lang === 'ar' ? 'حذف الجدول' : 'Delete Schedule'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'workorders' && (
          <div>
            {workOrders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-on-surface-variant mb-3">
                  {lang === 'ar' ? 'لم يتم إنشاء أوامر عمل من هذا الجدول بعد.' : 'No work orders generated from this schedule yet.'}
                </p>
                {!schedule.is_archived && (
                  <button
                    onClick={generateWorkOrder}
                    disabled={generating}
                    className={`bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors${generating ? ' opacity-70' : ''}`}
                  >
                    {generating
                      ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Generating...')
                      : (lang === 'ar' ? 'إنشاء أول أمر عمل' : 'Generate First Work Order')}
                  </button>
                )}
              </div>
            ) : (
              <div className="border border-outline-variant rounded-[12px] overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant">
                      {['Title', 'Priority', 'Status', 'Assigned To', 'Created'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {workOrders.map(wo => {
                      const woCfg = woStatusConfig[wo.status] ?? woStatusConfig.new
                      return (
                        <tr key={wo.id} className="bg-surface-container-lowest border-b border-outline-variant">
                          <td className="px-4 py-2.5">
                            <Link href={'/dashboard/work-orders/' + wo.id} className="text-on-surface font-medium text-sm hover:text-primary transition-colors">
                              {wo.title}
                            </Link>
                          </td>
                          <td className={`px-4 py-2.5 text-xs font-medium ${wo.priority === 'critical' ? 'text-error' : wo.priority === 'high' ? 'text-[#f57f17]' : 'text-on-surface-variant'}`}>
                            {wo.priority.charAt(0).toUpperCase() + wo.priority.slice(1)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`${woCfg.className} px-2 py-0.5 rounded-full text-xs font-medium`}>
                              {wo.status.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-on-surface-variant">{wo.assignee?.full_name ?? t('common.unassigned')}</td>
                          <td className="px-4 py-2.5 text-sm text-on-surface-variant">{format(new Date(wo.created_at), 'dd MMM yyyy')}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
