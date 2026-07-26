'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isPast } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { useActiveSite } from '@/context/ActiveSiteContext'
import { archiveConfirmMessage, nextDueOnDaysOfWeek, setPmScheduleActive, clearOpenGeneratedWorkOrders, DELETE_CLEARABLE_STATUSES } from './pm-utils'
import { stampChecklistTasks } from './checklist-stamp'
import { exportCSV } from '@/lib/csv'

export default function PMSchedulesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [groups, setGroups] = useState<any[]>([])
  const [groupFilter, setGroupFilter] = useState('')   // '' = all, 'none' = ungrouped, else group id
  const [groupBusy, setGroupBusy] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)
  const supabase = createClient()
  const { t, lang } = useLanguage()
  // 1C-33: active-site convenience filter (client-side; layered on RLS).
  const { activeSiteId } = useActiveSite()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchGroups() }, [])
  // Re-fetch whenever the active site changes ('all' = unscoped, as before).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchSchedules() }, [activeSiteId])

  async function fetchSchedules() {
    setLoading(true)
    let q = supabase
      .from('pm_schedules')
      .select('*, asset:asset_id(name), site:site_id(name), assignee:assigned_to(full_name)')
      .order('next_due_at', { ascending: true })
    if (activeSiteId !== 'all') q = q.eq('site_id', activeSiteId)
    const { data, error } = await q
    if (!error && data) setSchedules(data)
    setLoading(false)
  }

  async function fetchGroups() {
    // 1C-26: pm_schedule_groups may not exist yet (migration not run) — fail soft so
    // the page still works, just with the group filter showing only "All".
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
      if (profile) setOrgId(profile.organisation_id)
    }
    const { data, error } = await supabase.from('pm_schedule_groups').select('*').order('name')
    if (!error && data) setGroups(data)
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function generateWorkOrder(schedule: any) {
    if (schedule.is_archived) return
    // End date passed (or next due falls beyond it): don't generate.
    if (schedule.end_date && (Date.now() > new Date(schedule.end_date).getTime() ||
        (schedule.next_due_at && new Date(schedule.next_due_at) > new Date(schedule.end_date)))) {
      alert(lang === 'ar'
        ? 'انتهى هذا الجدول — تاريخ الانتهاء قد مضى، لن يتم إنشاء أوامر عمل جديدة.'
        : 'This schedule has ended — its end date has passed, so no new work orders will be generated.')
      return
    }
    setGenerating(schedule.id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGenerating(null); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setGenerating(null); return }
    const { data: newWO, error } = await supabase.from('work_orders').insert({
      title: schedule.title,
      description: schedule.description || null,
      priority: schedule.priority || 'medium',
      category: schedule.category || null,
      status: schedule.assigned_to ? 'assigned' : 'new',
      source: 'pm_schedule',
      pm_schedule_id: schedule.id,
      asset_id: schedule.asset_id || null,
      site_id: schedule.site_id || null,
      assigned_to: schedule.assigned_to || null,
      organisation_id: profile.organisation_id,
      created_by: user.id,
    }).select('id').single()
    if (!error) {
      // FM-05: stamp the schedule's checklist onto the generated WO.
      if (newWO) await stampChecklistTasks(supabase, { organisationId: profile.organisation_id, workOrderId: newWO.id, templateId: schedule.checklist_template_id })
      const nextDue = calculateNextDue(schedule)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: any = {
        last_completed_at: new Date().toISOString(),
        last_generated_at: new Date().toISOString(),
        next_due_at: nextDue,
      }
      // Rolled past the end date: this was the last cycle — deactivate.
      if (schedule.end_date && new Date(nextDue) > new Date(schedule.end_date)) update.is_active = false
      await supabase.from('pm_schedules').update(update).eq('id', schedule.id)
      fetchSchedules()
    }
    setGenerating(null)
  }

  async function deleteSelected() {
    if (!confirm(selected.length + ' schedule(s)?')) return
    setDeleting(true)
    // 1C-17: clear still-open generated WOs before the FK is SET NULL by the delete.
    await clearOpenGeneratedWorkOrders(supabase, selected, DELETE_CLEARABLE_STATUSES)
    await supabase.from('pm_schedules').delete().in('id', selected)
    setSelected([])
    await fetchSchedules()
    setDeleting(false)
  }

  async function archiveSelected() {
    if (!confirm(archiveConfirmMessage(lang, selected.length))) return
    setArchiving(true)
    await supabase.from('pm_schedules').update({ is_archived: true, is_active: false }).in('id', selected)
    setSelected([])
    await fetchSchedules()
    setArchiving(false)
  }

  async function archiveOne(id: string) {
    if (!confirm(archiveConfirmMessage(lang))) return
    await supabase.from('pm_schedules').update({ is_archived: true, is_active: false }).eq('id', id)
    setSelected(prev => prev.filter(x => x !== id))
    fetchSchedules()
  }

  async function deleteOne(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    // 1C-17: clear still-open generated WOs before the FK is SET NULL by the delete.
    await clearOpenGeneratedWorkOrders(supabase, id, DELETE_CLEARABLE_STATUSES)
    await supabase.from('pm_schedules').delete().eq('id', id)
    fetchSchedules()
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    const visible = (showArchived ? archivedList : activeList).filter(groupMatch)
    setSelected(prev => prev.length === visible.length ? [] : visible.map(s => s.id))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function toggleActive(schedule: any) {
    // 1C-16: pause cancels never-started auto WOs; resume rebaselines next_due_at.
    await setPmScheduleActive(supabase, schedule, !schedule.is_active)
    fetchSchedules()
  }

  // --- 1C-26: schedule groups (management-only grouping — the generator is untouched) ---

  // Assign the currently-selected schedules to a group (or ungroup with null). '__new'
  // prompts for a name and creates the group first. Reuses the same org-scoped insert
  // the create form uses; RLS gates writes to admin/manager.
  async function handleAssignGroup(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    e.target.value = '' // reset the picker
    if (!val || selected.length === 0) return
    let groupId: string | null = null
    if (val === '__none') {
      groupId = null
    } else if (val === '__new') {
      const name = (window.prompt(lang === 'ar' ? 'اسم المجموعة الجديدة' : 'New group name') ?? '').trim()
      if (!name || !orgId) return
      const { data, error } = await supabase.from('pm_schedule_groups').insert({ organisation_id: orgId, name }).select('id').single()
      if (error || !data) { alert((lang === 'ar' ? 'تعذّر إنشاء المجموعة: ' : 'Could not create group: ') + (error?.message ?? '')); return }
      groupId = data.id
    } else {
      groupId = val
    }
    await supabase.from('pm_schedules').update({ group_id: groupId }).in('id', selected)
    setSelected([])
    await Promise.all([fetchSchedules(), fetchGroups()])
  }

  // Schedules (any state, non-archived) belonging to the filtered group.
  function schedulesInFilteredGroup() {
    return schedules.filter(s => !s.is_archived && s.group_id === groupFilter)
  }

  async function setGroupActive(active: boolean) {
    const targets = schedulesInFilteredGroup().filter(s => s.is_active !== active)
    if (targets.length === 0) return
    setGroupBusy(true)
    // Reuse the shipped lifecycle helper so WO-cleanup semantics stay identical.
    for (const s of targets) await setPmScheduleActive(supabase, s, active)
    await fetchSchedules()
    setGroupBusy(false)
  }

  async function deleteGroup() {
    const targets = schedulesInFilteredGroup()
    const grp = groups.find(g => g.id === groupFilter)
    if (!confirm(lang === 'ar'
      ? `حذف المجموعة "${grp?.name ?? ''}" و${targets.length} جدول/جداول بداخلها نهائياً؟`
      : `Delete group "${grp?.name ?? ''}" and its ${targets.length} schedule(s) permanently?`)) return
    setGroupBusy(true)
    const ids = targets.map(s => s.id)
    if (ids.length > 0) {
      // 1C-17: clear still-open generated WOs before the FK is SET NULL by the delete.
      await clearOpenGeneratedWorkOrders(supabase, ids, DELETE_CLEARABLE_STATUSES)
      await supabase.from('pm_schedules').delete().in('id', ids)
    }
    await supabase.from('pm_schedule_groups').delete().eq('id', groupFilter)
    setGroupFilter('')
    await Promise.all([fetchSchedules(), fetchGroups()])
    setGroupBusy(false)
  }

  function handleExport() {
    const list = (showArchived ? archivedList : activeList).filter(groupMatch)
    if (list.length === 0) { alert(lang === 'ar' ? 'لا توجد جداول للتصدير.' : 'No schedules to export.'); return }
    // exportCSV sanitizes every cell against CSV formula-injection (lib/csv).
    exportCSV(`pm-schedules-${new Date().toISOString().slice(0, 10)}.csv`, list.map(s => ({
      title: s.title ?? '', description: s.description ?? '', frequency: s.frequency ?? '',
      priority: s.priority ?? '', category: s.category ?? '',
      site_name: s.site?.name ?? '', asset_name: s.asset?.name ?? '',
      next_due_at: s.next_due_at ? s.next_due_at.slice(0, 10) : '',
      end_date: s.end_date ? String(s.end_date).slice(0, 10) : '',
      interval_count: s.interval_count ?? '', interval_unit: s.interval_unit ?? '',
      anchor_day: s.anchor_day ?? '', estimated_duration_minutes: s.estimated_duration_minutes ?? '',
      group: groupsById.get(s.group_id)?.name ?? '',
      is_active: s.is_active ? 'true' : 'false',
    })))
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

  // Archived schedules are hidden from the default list (and from stats).
  const activeList = schedules.filter(s => !s.is_archived)
  const archivedList = schedules.filter(s => s.is_archived)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupsById = new Map<string, any>(groups.map(g => [g.id, g]))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupMatch = (s: any) => groupFilter === '' ? true : groupFilter === 'none' ? !s.group_id : s.group_id === groupFilter
  const rows = (showArchived ? archivedList : activeList).filter(groupMatch)
  const groupSelected = groupFilter !== '' && groupFilter !== 'none'

  const stats = {
    total:  activeList.length,
    active: activeList.filter(s => s.is_active).length,
    due:    activeList.filter(s => s.is_active && isDue(s)).length,
    soon:   activeList.filter(s => s.is_active && isDueSoon(s) && !isDue(s)).length,
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
          <div className="flex gap-3 flex-wrap">
            <button onClick={handleExport}
              className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">
              {lang === 'ar' ? 'تصدير CSV' : 'Export CSV'}
            </button>
            <Link href="/dashboard/pm-schedules/import">
              <button className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">
                {lang === 'ar' ? 'استيراد CSV' : 'Import CSV'}
              </button>
            </Link>
            <button
              onClick={() => { setShowArchived(v => !v); setSelected([]) }}
              className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${showArchived ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low'}`}
            >
              {lang === 'ar' ? `المؤرشفة (${archivedList.length})` : `Archived (${archivedList.length})`}
            </button>
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

        {/* Group filter + whole-group bulk actions (1C-26) */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-semibold text-on-surface-variant">{lang === 'ar' ? 'المجموعة' : 'Group'}</label>
          <select
            value={groupFilter}
            onChange={e => { setGroupFilter(e.target.value); setSelected([]) }}
            className="px-3 py-2 rounded-xl border border-outline-variant/40 text-sm bg-surface-container-lowest text-on-surface"
          >
            <option value="">{lang === 'ar' ? 'كل المجموعات' : 'All groups'}</option>
            <option value="none">{lang === 'ar' ? 'بدون مجموعة' : 'Ungrouped'}</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          {groupSelected && !showArchived && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-on-surface-variant">{schedulesInFilteredGroup().length} {lang === 'ar' ? 'في المجموعة' : 'in group'}</span>
              <button onClick={() => setGroupActive(false)} disabled={groupBusy}
                className="px-3 py-2 rounded-xl border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50">
                {lang === 'ar' ? 'إيقاف المجموعة' : 'Pause group'}
              </button>
              <button onClick={() => setGroupActive(true)} disabled={groupBusy}
                className="px-3 py-2 rounded-xl border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors disabled:opacity-50">
                {lang === 'ar' ? 'تفعيل المجموعة' : 'Resume group'}
              </button>
              <button onClick={deleteGroup} disabled={groupBusy}
                className="px-3 py-2 rounded-xl border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors disabled:opacity-50">
                {lang === 'ar' ? 'حذف المجموعة' : 'Delete group'}
              </button>
            </div>
          )}
        </div>

        {/* Bulk archive / delete */}
        {selected.length > 0 && !showArchived && (
          <div className="bg-error/5 border border-error/20 rounded-xl p-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-error">{selected.length} {t('common.selected')}</span>
            <select onChange={handleAssignGroup} defaultValue=""
              className="px-3 py-2 rounded-xl border border-outline-variant/40 text-sm bg-surface-container-lowest text-on-surface">
              <option value="">{lang === 'ar' ? 'نقل إلى مجموعة…' : 'Move to group…'}</option>
              <option value="__none">{lang === 'ar' ? 'إزالة من المجموعة' : 'Ungroup'}</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="__new">{lang === 'ar' ? '＋ مجموعة جديدة…' : '＋ New group…'}</option>
            </select>
            <button onClick={archiveSelected} disabled={archiving}
              className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
              {archiving ? t('common.loading') : (lang === 'ar' ? 'أرشفة المحددة' : 'Archive Selected')}
            </button>
            <button onClick={deleteSelected} disabled={deleting}
              className="px-4 py-2 rounded-xl bg-error text-on-error text-sm font-semibold disabled:opacity-50 hover:bg-error/90 transition-colors">
              {deleting ? t('common.loading') : t('btn.delete_selected')}
            </button>
            <button onClick={() => setSelected([])} className="px-4 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
          </div>
        )}

        {/* Table */}
        {rows.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">{showArchived ? 'inventory_2' : 'event_repeat'}</span>
            {showArchived ? (
              <p className="text-lg font-semibold mb-1">{lang === 'ar' ? 'لا توجد جداول مؤرشفة' : 'No archived schedules'}</p>
            ) : (
              <>
                <p className="text-lg font-semibold mb-1">{lang === 'ar' ? 'لا توجد جداول صيانة بعد' : 'No PM schedules yet'}</p>
                <p className="text-sm">{lang === 'ar' ? 'أنشئ أول جدول صيانة وقائية للبدء' : 'Create your first preventive maintenance schedule to get started'}</p>
              </>
            )}
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container border-b border-outline-variant/30">
                    <th className="p-3 w-10">
                      {!showArchived && (
                        <input type="checkbox" checked={selected.length === rows.length && rows.length > 0} onChange={toggleSelectAll} className="rounded" />
                      )}
                    </th>
                    {[t('pm.col.title'), t('pm.col.asset'), t('pm.col.freq'), t('pm.col.compliance'), t('pm.col.due'), t('wo.col.assigned'), t('common.status'), t('common.actions')].map(h => (
                      <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {rows.map(s => {
                    const due = isDue(s)
                    const soon = isDueSoon(s)
                    return (
                      <tr key={s.id} className={`hover:bg-surface-container-low transition-colors ${selected.includes(s.id) ? 'bg-primary/5' : due && !s.is_archived ? 'bg-error/5' : ''}`}>
                        <td className="p-3">
                          {!showArchived && (
                            <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} className="rounded" />
                          )}
                        </td>
                        <td className="p-3">
                          <Link href={'/dashboard/pm-schedules/' + s.id} className="text-sm font-semibold text-primary hover:underline">
                            {s.title}
                          </Link>
                          {s.description && (
                            <p className="text-xs text-on-surface-variant mt-0.5 max-w-[240px] truncate">{s.description}</p>
                          )}
                          {s.group_id && groupsById.get(s.group_id) && (
                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-secondary/10 text-secondary">
                              <span className="material-symbols-outlined text-[12px]">folder</span>{groupsById.get(s.group_id).name}
                            </span>
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
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${s.is_archived ? 'bg-surface-container text-on-surface-variant' : s.is_active ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                            {s.is_archived ? (lang === 'ar' ? 'مؤرشف' : 'Archived') : s.is_active ? t('common.active') : t('common.inactive')}
                          </span>
                        </td>
                        <td className="p-3">
                          {s.is_archived ? (
                            <span className="text-xs text-on-surface-variant">—</span>
                          ) : (
                            <div className="flex gap-1.5 flex-wrap">
                              <button onClick={() => generateWorkOrder(s)} disabled={generating === s.id}
                                className="px-2.5 py-1 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 whitespace-nowrap">
                                {generating === s.id ? '...' : (lang === 'ar' ? 'إنشاء أمر عمل' : 'Generate WO')}
                              </button>
                              <Link href={'/dashboard/pm-schedules/' + s.id + '/edit'}>
                                <button className="px-2.5 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                              </Link>
                              <button onClick={() => toggleActive(s)}
                                className="px-2.5 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors whitespace-nowrap">
                                {s.is_active ? (lang === 'ar' ? 'إيقاف' : 'Pause') : (lang === 'ar' ? 'تفعيل' : 'Resume')}
                              </button>
                              <button onClick={() => archiveOne(s.id)}
                                className="px-2.5 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors whitespace-nowrap">
                                {lang === 'ar' ? 'أرشفة' : 'Archive'}
                              </button>
                              <button onClick={() => deleteOne(s.id)}
                                className="px-2.5 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">{t('common.delete')}</button>
                            </div>
                          )}
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
