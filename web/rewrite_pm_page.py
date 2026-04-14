content = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isPast } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

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
    daily: lang === 'ar' ? 'يومي' : 'Daily',
    weekly: lang === 'ar' ? 'أسبوعي' : 'Weekly',
    fortnightly: lang === 'ar' ? 'كل أسبوعين' : 'Fortnightly',
    monthly: lang === 'ar' ? 'شهري' : 'Monthly',
    quarterly: lang === 'ar' ? 'ربع سنوي' : 'Quarterly',
    biannual: lang === 'ar' ? 'كل 6 أشهر' : 'Every 6 Months',
    annual: lang === 'ar' ? 'سنوي' : 'Annual',
  }

  const isDue = (s: any) => s.next_due_at && isPast(new Date(s.next_due_at))
  const isDueSoon = (s: any) => {
    if (!s.next_due_at) return false
    const days = Math.ceil((new Date(s.next_due_at).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 7
  }

  const stats = {
    total: schedules.length,
    active: schedules.filter(s => s.is_active).length,
    due: schedules.filter(s => s.is_active && isDue(s)).length,
    soon: schedules.filter(s => s.is_active && isDueSoon(s) && !isDue(s)).length,
  }

  const btnStyle = (active: boolean) => ({
    padding: '6px 14px', borderRadius: 8, border: active ? 'none' : '1px solid #ddd',
    background: active ? '#1a1a2e' : 'white', color: active ? 'white' : '#333',
    cursor: 'pointer', fontSize: 13, fontWeight: active ? 600 : 400,
  })

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('pm.title')}</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>
            {stats.total} {t('pm.title').toLowerCase()} &middot; {stats.active} {t('common.active').toLowerCase()}
            {stats.due > 0 && <span style={{ color: '#c62828' }}> &middot; {stats.due} {lang === 'ar' ? 'متأخر' : 'overdue'}</span>}
            {stats.soon > 0 && <span style={{ color: '#f57f17' }}> &middot; {stats.soon} {lang === 'ar' ? 'قريباً' : 'due soon'}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href='/dashboard/pm-schedules/calendar'>
            <button style={btnStyle(false)}>{t('pm.calendar')}</button>
          </Link>
          <Link href='/dashboard/pm-schedules/compliance'>
            <button style={btnStyle(false)}>{t('pm.compliance')}</button>
          </Link>
          <Link href='/dashboard/pm-schedules/new'>
            <button style={{ ...btnStyle(true), background: '#1a1a2e' }}>{t('pm.new')}</button>
          </Link>
        </div>
      </div>

      {selected.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#b71c1c' }}>{selected.length} {t('common.selected')}</span>
          <button onClick={deleteSelected} disabled={deleting} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#c62828', color: 'white', cursor: 'pointer', fontSize: 12 }}>
            {deleting ? t('common.loading') : t('btn.delete_selected')}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ef9a9a', background: 'white', cursor: 'pointer', fontSize: 12 }}>{t('common.cancel')}</button>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#999' }}>{t('common.loading')}</p>
      ) : schedules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>{lang === 'ar' ? 'لا توجد جداول صيانة بعد' : 'No PM schedules yet'}</p>
          <p style={{ fontSize: 13 }}>{lang === 'ar' ? 'أنشئ أول جدول صيانة وقائية للبدء' : 'Create your first preventive maintenance schedule to get started'}</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '12px 16px', width: 40 }}>
                  <input type='checkbox' checked={selected.length === schedules.length && schedules.length > 0} onChange={toggleSelectAll} />
                </th>
                {[t('pm.col.title'), t('pm.col.asset'), t('pm.col.freq'), t('pm.col.compliance'), t('pm.col.due'), t('wo.col.assigned'), t('common.status'), t('common.actions')].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, i) => {
                const due = isDue(s)
                const soon = isDueSoon(s)
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', background: selected.includes(s.id) ? '#f3f4fd' : due ? '#fff8f8' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <input type='checkbox' checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Link href={'/dashboard/pm-schedules/' + s.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>{s.title}</Link>
                      {s.description && <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0' }}>{s.description.substring(0, 60)}...</p>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.asset?.name ?? s.site?.name ?? '\u2014'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#f3f4fd', color: '#283593', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>
                        {freqLabel[s.frequency] ?? s.frequency}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#666' }}>
                      {s.completed_count > 0 ? Math.round((s.on_time_count / s.completed_count) * 100) + '%' : '\u2014'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: due ? '#c62828' : soon ? '#f57f17' : '#666' }}>
                      {s.next_due_at ? format(new Date(s.next_due_at), 'dd MMM yyyy') : '\u2014'}
                      {due && <span style={{ fontSize: 10, display: 'block', color: '#c62828' }}>{lang === 'ar' ? 'متأخر' : 'Overdue'}</span>}
                      {soon && !due && <span style={{ fontSize: 10, display: 'block', color: '#f57f17' }}>{lang === 'ar' ? 'قريباً' : 'Due soon'}</span>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.assignee?.full_name ?? t('common.unassigned')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: s.is_active ? '#e8f5e9' : '#f5f5f5', color: s.is_active ? '#2e7d32' : '#666', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>
                        {s.is_active ? t('common.active') : t('common.inactive')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button onClick={() => generateWorkOrder(s)} disabled={generating === s.id} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 11 }}>
                          {generating === s.id ? '...' : (lang === 'ar' ? 'إنشاء أمر عمل' : 'Generate WO')}
                        </button>
                        <Link href={'/dashboard/pm-schedules/' + s.id + '/edit'}>
                          <button style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>{t('common.edit')}</button>
                        </Link>
                        <button onClick={() => toggleActive(s.id, s.is_active)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>
                          {s.is_active ? (lang === 'ar' ? 'إيقاف' : 'Pause') : (lang === 'ar' ? 'تفعيل' : 'Resume')}
                        </button>
                        <button onClick={() => deleteOne(s.id)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 11 }}>{t('common.delete')}</button>
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
}"""

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('PM schedules page completely rewritten')