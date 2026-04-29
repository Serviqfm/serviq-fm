'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isPast } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, pageStyle, cardStyle, primaryBtn, tableHeaderCell, tableCell, dangerBtn } from '@/lib/brand'

export default function PMSchedulesPage() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const { t, lang } = useLanguage()

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
    daily:       lang === 'ar' ? 'يومي'         : 'Daily',
    weekly:      lang === 'ar' ? 'أسبوعي'       : 'Weekly',
    fortnightly: lang === 'ar' ? 'كل أسبوعين'   : 'Fortnightly',
    monthly:     lang === 'ar' ? 'شهري'         : 'Monthly',
    quarterly:   lang === 'ar' ? 'ربع سنوي'     : 'Quarterly',
    biannual:    lang === 'ar' ? 'كل 6 أشهر'    : 'Every 6 Months',
    annual:      lang === 'ar' ? 'سنوي'         : 'Annual',
  }

  const isDue = (s: any) => s.next_due_at && isPast(new Date(s.next_due_at))
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

  const filterBtnStyle = (active: boolean) => ({
    padding: '6px 14px', borderRadius: 8,
    border: active ? 'none' : `1px solid ${C.border}`,
    background: active ? C.navy : C.white,
    color: active ? C.white : C.textMid,
    cursor: 'pointer', fontSize: 13,
    fontWeight: active ? 600 : 400,
    fontFamily: F.en,
  })

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{t('pm.title')}</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>
            {stats.total} {t('pm.title').toLowerCase()} &middot; {stats.active} {t('common.active').toLowerCase()}
            {stats.due > 0 && <span style={{ color: C.danger }}> &middot; {stats.due} {lang === 'ar' ? 'متأخر' : 'overdue'}</span>}
            {stats.soon > 0 && <span style={{ color: C.warning }}> &middot; {stats.soon} {lang === 'ar' ? 'قريباً' : 'due soon'}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href='/dashboard/pm-schedules/calendar'>
            <button style={filterBtnStyle(false)}>{t('pm.calendar')}</button>
          </Link>
          <Link href='/dashboard/pm-schedules/compliance'>
            <button style={filterBtnStyle(false)}>{t('pm.compliance')}</button>
          </Link>
          <Link href='/dashboard/pm-schedules/new'>
            <button style={primaryBtn}>{t('pm.new')}</button>
          </Link>
        </div>
      </div>

      {selected.length > 0 && (
        <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.danger, fontFamily: F.en }}>{selected.length} {t('common.selected')}</span>
          <button onClick={deleteSelected} disabled={deleting} style={{ ...dangerBtn, padding: '6px 16px', fontSize: 12 }}>
            {deleting ? t('common.loading') : t('btn.delete_selected')}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.dangerBorder}`, background: C.white, cursor: 'pointer', fontSize: 12, color: C.textMid, fontFamily: F.en }}>{t('common.cancel')}</button>
        </div>
      )}

      {loading ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>{t('common.loading')}</p>
      ) : schedules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.textLight, fontFamily: F.en }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>{lang === 'ar' ? 'لا توجد جداول صيانة بعد' : 'No PM schedules yet'}</p>
          <p style={{ fontSize: 13 }}>{lang === 'ar' ? 'أنشئ أول جدول صيانة وقائية للبدء' : 'Create your first preventive maintenance schedule to get started'}</p>
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: '10px 16px', width: 40 }}>
                  <input type='checkbox' checked={selected.length === schedules.length && schedules.length > 0} onChange={toggleSelectAll} />
                </th>
                {[t('pm.col.title'), t('pm.col.asset'), t('pm.col.freq'), t('pm.col.compliance'), t('pm.col.due'), t('wo.col.assigned'), t('common.status'), t('common.actions')].map(h => (
                  <th key={h} style={tableHeaderCell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => {
                const due = isDue(s)
                const soon = isDueSoon(s)
                return (
                  <tr key={s.id} style={{ background: selected.includes(s.id) ? '#EEF2FF' : due ? '#FFF8F8' : C.white }}>
                    <td style={{ padding: '12px 16px' }}>
                      <input type='checkbox' checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} />
                    </td>
                    <td style={tableCell}>
                      <Link href={'/dashboard/pm-schedules/' + s.id} style={{ color: C.navy, fontWeight: 500, textDecoration: 'none', fontSize: 14, fontFamily: F.en }}>{s.title}</Link>
                      {s.description && <p style={{ fontSize: 11, color: C.textLight, fontFamily: F.en, margin: '2px 0 0' }}>{s.description.substring(0, 60)}...</p>}
                    </td>
                    <td style={tableCell}>{s.asset?.name ?? s.site?.name ?? '—'}</td>
                    <td style={tableCell}>
                      <span style={{ background: C.pageBg, color: C.textMid, border: `1px solid ${C.border}`, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontFamily: F.en }}>
                        {freqLabel[s.frequency] ?? s.frequency}
                      </span>
                    </td>
                    <td style={tableCell}>
                      {s.completed_count > 0 ? Math.round((s.on_time_count / s.completed_count) * 100) + '%' : '—'}
                    </td>
                    <td style={{ ...tableCell, color: due ? C.danger : soon ? C.warning : C.textMid }}>
                      {s.next_due_at ? format(new Date(s.next_due_at), 'dd MMM yyyy') : '—'}
                      {due && <span style={{ fontSize: 10, display: 'block', color: C.danger, fontFamily: F.en }}>{lang === 'ar' ? 'متأخر' : 'Overdue'}</span>}
                      {soon && !due && <span style={{ fontSize: 10, display: 'block', color: C.warning, fontFamily: F.en }}>{lang === 'ar' ? 'قريباً' : 'Due soon'}</span>}
                    </td>
                    <td style={tableCell}>{s.assignee?.full_name ?? t('common.unassigned')}</td>
                    <td style={tableCell}>
                      <span style={{ background: s.is_active ? '#DCFCE7' : C.pageBg, color: s.is_active ? C.success : C.textMid, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontFamily: F.en }}>
                        {s.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td style={tableCell}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => generateWorkOrder(s)} disabled={generating === s.id} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: C.navy, color: C.white, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>
                          {generating === s.id ? '...' : (lang === 'ar' ? 'إنشاء أمر عمل' : 'Generate WO')}
                        </button>
                        <Link href={'/dashboard/pm-schedules/' + s.id + '/edit'}>
                          <button style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.edit')}</button>
                        </Link>
                        <button onClick={() => toggleActive(s.id, s.is_active)} style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>
                          {s.is_active ? (lang === 'ar' ? 'إيقاف' : 'Pause') : (lang === 'ar' ? 'تفعيل' : 'Resume')}
                        </button>
                        <button onClick={() => deleteOne(s.id)} style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.delete')}</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
