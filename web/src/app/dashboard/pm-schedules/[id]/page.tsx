'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isPast } from 'date-fns'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, pageStyle, primaryBtn, secondaryBtn, dangerBtn } from '@/lib/brand'

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

const freqLabel: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', fortnightly: 'Fortnightly',
  monthly: 'Monthly', quarterly: 'Quarterly', biannual: 'Every 6 Months', annual: 'Annual',
}

const woStatusConfig: Record<string, { bg: string; color: string }> = {
  new:         { bg: '#e3f2fd', color: '#1A7FC1' },
  assigned:    { bg: '#e8eaf6', color: '#1E2D4E' },
  in_progress: { bg: '#fff8e1', color: '#F57F17' },
  on_hold:     { bg: '#fce4ec', color: '#C62828' },
  completed:   { bg: '#e8f5e9', color: '#2E7D32' },
  closed:      { bg: '#f5f5f5', color: '#4A5568' },
}

export default function PMScheduleDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const [schedule, setSchedule] = useState<any>(null)
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'workorders'>('details')

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
    if (!schedule) return
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
      await supabase.from('pm_schedules').update({
        last_completed_at: new Date().toISOString(),
        last_generated_at: new Date().toISOString(),
        next_due_at: calculateNextDue(schedule.frequency),
      }).eq('id', id)
      fetchAll()
    }
    setGenerating(false)
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

  if (loading) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>Loading...</div>
  if (!schedule) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>PM Schedule not found.</div>

  const isDue = schedule.next_due_at && isPast(new Date(schedule.next_due_at))
  const complianceRate = schedule.completed_count > 0
    ? Math.round((schedule.on_time_count / schedule.completed_count) * 100)
    : null

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px', border: 'none',
    borderBottom: active ? `2px solid ${C.navy}` : '2px solid transparent',
    background: 'transparent', cursor: 'pointer',
    fontSize: 13, fontWeight: (active ? 600 : 400) as any,
    color: active ? C.navy : C.textLight,
    fontFamily: F.en,
  })

  const infoCard = { background: C.pageBg, borderRadius: 8, padding: '12px 16px' }

  return (
    <div style={{ ...pageStyle, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <a href='/dashboard/pm-schedules' style={{ color: C.textLight, fontSize: 13, textDecoration: 'none', fontFamily: F.en }}>
          {lang === 'ar' ? '← رجوع' : '← Back to PM Schedules'}
        </a>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleActive} style={secondaryBtn}>
            {schedule.is_active
              ? (lang === 'ar' ? 'إيقاف' : 'Pause')
              : (lang === 'ar' ? 'تفعيل' : 'Resume')}
          </button>
          <Link href={'/dashboard/pm-schedules/' + id + '/edit'}>
            <button style={secondaryBtn}>{t('common.edit')}</button>
          </Link>
          <button onClick={generateWorkOrder} disabled={generating} style={{ ...primaryBtn, opacity: generating ? 0.7 : 1 }}>
            {generating
              ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Generating...')
              : (lang === 'ar' ? 'إنشاء أمر عمل' : 'Generate Work Order')}
          </button>
        </div>
      </div>

      <div style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{schedule.title}</h1>
          <span style={{ background: schedule.is_active ? '#DCFCE7' : C.pageBg, color: schedule.is_active ? C.success : C.textMid, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>
            {schedule.is_active
              ? (lang === 'ar' ? 'نشط' : 'Active')
              : (lang === 'ar' ? 'موقوف' : 'Paused')}
          </span>
          {isDue && schedule.is_active && (
            <span style={{ background: '#fce4ec', color: C.danger, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>
              {lang === 'ar' ? 'متأخر' : 'Overdue'}
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, marginTop: 6 }}>
          {freqLabel[schedule.frequency] ?? schedule.frequency}
          {schedule.estimated_duration_minutes && ` · ${schedule.estimated_duration_minutes} min`}
          {schedule.completed_count > 0 && ` · ${schedule.completed_count} ${lang === 'ar' ? 'إتمام' : 'completions'}`}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
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
          <div key={stat.label} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, color: C.textLight, fontFamily: F.en, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{stat.label}</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: stat.alert ? C.danger : C.navy, fontFamily: F.en, margin: 0 }}>{String(stat.value)}</p>
          </div>
        ))}
      </div>

      <div style={{ borderBottom: `1px solid ${C.border}`, marginBottom: '1.5rem', display: 'flex' }}>
        <button style={tabStyle(activeTab === 'details')} onClick={() => setActiveTab('details')}>
          {lang === 'ar' ? 'التفاصيل' : 'Details'}
        </button>
        <button style={tabStyle(activeTab === 'workorders')} onClick={() => setActiveTab('workorders')}>
          {lang === 'ar' ? `أوامر العمل (${workOrders.length})` : `Generated Work Orders (${workOrders.length})`}
        </button>
      </div>

      {activeTab === 'details' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {[
              { label: lang === 'ar' ? 'الأصل' : 'Asset',             value: schedule.asset?.name ?? '—' },
              { label: lang === 'ar' ? 'الموقع' : 'Site',              value: schedule.site?.name ?? '—' },
              { label: lang === 'ar' ? 'التكرار' : 'Frequency',        value: freqLabel[schedule.frequency] ?? schedule.frequency },
              { label: lang === 'ar' ? 'المعين إليه' : 'Assigned To',  value: schedule.assignee?.full_name ?? t('common.unassigned') },
              { label: lang === 'ar' ? 'المدة التقديرية' : 'Est. Duration',
                value: schedule.estimated_duration_minutes ? schedule.estimated_duration_minutes + ' min' : '—' },
              { label: lang === 'ar' ? 'الموعد القادم' : 'Next Due',
                value: schedule.next_due_at ? format(new Date(schedule.next_due_at), 'dd MMM yyyy HH:mm') : '—' },
              { label: lang === 'ar' ? 'موسمي' : 'Seasonal',
                value: schedule.is_seasonal
                  ? `Month ${schedule.seasonal_start_month} – ${schedule.seasonal_end_month}`
                  : (lang === 'ar' ? 'لا' : 'No') },
              { label: lang === 'ar' ? 'آخر إتمام' : 'Last Completed',
                value: schedule.last_completed_at
                  ? format(new Date(schedule.last_completed_at), 'dd MMM yyyy')
                  : (lang === 'ar' ? 'لم يتم' : 'Never') },
            ].map(({ label, value }) => (
              <div key={label} style={infoCard}>
                <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: C.textDark, fontFamily: F.en, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>
          {schedule.description && (
            <div style={{ ...infoCard, marginTop: 4 }}>
              <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 6px' }}>
                {lang === 'ar' ? 'الوصف' : 'Description'}
              </p>
              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6, color: C.textDark, fontFamily: F.en }}>{schedule.description}</p>
            </div>
          )}
          {schedule.asset && (
            <div style={{ marginTop: '1rem' }}>
              <Link href={'/dashboard/assets/' + schedule.asset.id} style={{ color: C.blue, fontSize: 13, fontFamily: F.en, textDecoration: 'none' }}>
                {lang === 'ar' ? '→ عرض الأصل' : '→ View Asset'}
              </Link>
            </div>
          )}
          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${C.border}` }}>
            <button onClick={deleteSchedule} style={{ ...dangerBtn, fontSize: 13, padding: '8px 18px' }}>
              {lang === 'ar' ? 'حذف الجدول' : 'Delete Schedule'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'workorders' && (
        <div>
          {workOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: C.textLight, fontFamily: F.en }}>
              <p style={{ fontSize: 14, marginBottom: 12 }}>
                {lang === 'ar' ? 'لم يتم إنشاء أوامر عمل من هذا الجدول بعد.' : 'No work orders generated from this schedule yet.'}
              </p>
              <button onClick={generateWorkOrder} disabled={generating} style={{ ...primaryBtn, opacity: generating ? 0.7 : 1 }}>
                {generating
                  ? (lang === 'ar' ? 'جاري الإنشاء...' : 'Generating...')
                  : (lang === 'ar' ? 'إنشاء أول أمر عمل' : 'Generate First Work Order')}
              </button>
            </div>
          ) : (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                    {['Title', 'Priority', 'Status', 'Assigned To', 'Created'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: F.en }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workOrders.map(wo => {
                    const woCfg = woStatusConfig[wo.status] ?? woStatusConfig.new
                    return (
                      <tr key={wo.id} style={{ background: C.white }}>
                        <td style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                          <Link href={'/dashboard/work-orders/' + wo.id} style={{ color: C.navy, fontWeight: 500, textDecoration: 'none', fontSize: 13, fontFamily: F.en }}>{wo.title}</Link>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500, fontFamily: F.en, borderBottom: `1px solid ${C.border}`, color: wo.priority === 'critical' ? C.danger : wo.priority === 'high' ? C.warning : C.textMid }}>
                          {wo.priority.charAt(0).toUpperCase() + wo.priority.slice(1)}
                        </td>
                        <td style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ background: woCfg.bg, color: woCfg.color, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>
                            {wo.status.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: C.textMid, fontFamily: F.en, borderBottom: `1px solid ${C.border}` }}>{wo.assignee?.full_name ?? t('common.unassigned')}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: C.textMid, fontFamily: F.en, borderBottom: `1px solid ${C.border}` }}>{format(new Date(wo.created_at), 'dd MMM yyyy')}</td>
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
  )
}
