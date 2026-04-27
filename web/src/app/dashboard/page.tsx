'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, formatDistanceToNow, differenceInHours } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, cardStyle, pageStyle } from '@/lib/brand'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalOpenWOs: 0,
    overdueWOs: 0,
    pmDueToday: 0,
    completedThisMonth: 0,
    totalAssets: 0,
    activeAssets: 0,
    pmCompliancePercent: 0,
    activeTechnicians: 0,
    mttr: 0,
    totalMaintenanceCost: 0,
  })
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [upcomingPMs, setUpcomingPMs] = useState<any[]>([])
  const [openByStatus, setOpenByStatus] = useState<Record<string, number>>({})
  const [openByPriority, setOpenByPriority] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const supabase = createClient()
  const { t, lang } = useLanguage()

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      if (typeof window !== 'undefined') window.location.href = '/login'
      return
    }
    const { data: profile } = await supabase.from('users').select('organisation_id, full_name').eq('id', user.id).single()
    if (!profile) {
      setLoading(false)
      return
    }
    if (profile.full_name) setUserName(profile.full_name)
    const orgId = profile.organisation_id

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

    const [
      { data: allWOs },
      { data: assets },
      { data: pmSchedules },
      { data: auditLogs },
      { data: upcoming },
      { data: activeTechs },
      { data: closedWOs },
    ] = await Promise.all([
      supabase.from('work_orders').select('id, status, priority, due_at, created_at, title, started_at, completed_at').eq('organisation_id', orgId),
      supabase.from('assets').select('id, status').eq('organisation_id', orgId),
      supabase.from('pm_schedules').select('id, is_active, next_due_at, last_completed_at').eq('organisation_id', orgId),
      supabase.from('audit_logs').select('id, action, entity_type, created_at').eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(15),
      supabase.from('pm_schedules').select('id, title, next_due_at, asset:asset_id(name), assignee:assigned_to(full_name)').eq('organisation_id', orgId).eq('is_active', true).gte('next_due_at', now.toISOString()).order('next_due_at', { ascending: true }).limit(7),
      supabase.from('users').select('id').eq('organisation_id', orgId).eq('role', 'technician').eq('is_active', true),
      supabase.from('work_orders').select('actual_cost, started_at, completed_at').eq('organisation_id', orgId).eq('status', 'closed').gte('created_at', startOfMonth),
    ])

    const wos = allWOs ?? []
    const openWOs = wos.filter(w => !['completed','closed'].includes(w.status))
    const overdueWOs = openWOs.filter(w => w.due_at && new Date(w.due_at) < now)
    const completedThisMonth = wos.filter(w => w.status === 'completed' && w.created_at >= startOfMonth)

    const pmDueToday = (pmSchedules ?? []).filter(p => p.is_active && p.next_due_at && p.next_due_at <= endOfToday)
    const activePMs = (pmSchedules ?? []).filter(p => p.is_active)
    const completedPMs = activePMs.filter(p => p.last_completed_at)
    const pmCompliance = activePMs.length > 0 ? Math.round((completedPMs.length / activePMs.length) * 100) : 0

    const closed = closedWOs ?? []
    const totalCost = closed.reduce((sum, w) => sum + (Number(w.actual_cost) || 0), 0)
    const wosWithTime = closed.filter(w => w.started_at && w.completed_at)
    const avgMTTR = wosWithTime.length > 0
      ? Math.round(wosWithTime.reduce((sum, w) => sum + differenceInHours(new Date(w.completed_at), new Date(w.started_at)), 0) / wosWithTime.length)
      : 0

    const byStatus: Record<string, number> = {}
    const byPriority: Record<string, number> = {}
    openWOs.forEach(w => {
      byStatus[w.status] = (byStatus[w.status] || 0) + 1
      byPriority[w.priority] = (byPriority[w.priority] || 0) + 1
    })

    setStats({
      totalOpenWOs: openWOs.length,
      overdueWOs: overdueWOs.length,
      pmDueToday: pmDueToday.length,
      completedThisMonth: completedThisMonth.length,
      totalAssets: (assets ?? []).length,
      activeAssets: (assets ?? []).filter(a => a.status === 'active').length,
      pmCompliancePercent: pmCompliance,
      activeTechnicians: (activeTechs ?? []).length,
      mttr: avgMTTR,
      totalMaintenanceCost: totalCost,
    })
    setOpenByStatus(byStatus)
    setOpenByPriority(byPriority)
    setRecentActivity(auditLogs ?? [])
    setUpcomingPMs(upcoming ?? [])
    setLoading(false)
  }

  if (loading) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>Loading dashboard...</div>

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const statCards = [
    { label: t('dashboard.open_wos'),         value: stats.totalOpenWOs,                                                                  color: C.navy,    link: '/dashboard/work-orders' },
    { label: t('dashboard.overdue'),          value: stats.overdueWOs,                                                                    color: stats.overdueWOs > 0 ? C.danger : C.success,                                                          link: '/dashboard/work-orders' },
    { label: t('dashboard.pm_due_today'),     value: stats.pmDueToday,                                                                    color: stats.pmDueToday > 0 ? C.warning : C.success,                                                         link: '/dashboard/pm-schedules' },
    { label: t('dashboard.completed_month'),  value: stats.completedThisMonth,                                                            color: C.success, link: '/dashboard/work-orders' },
    { label: t('dashboard.active_techs'),     value: stats.activeTechnicians,                                                             color: C.navy,    link: '/dashboard/work-orders' },
    { label: t('dashboard.pm_compliance'),    value: stats.pmCompliancePercent + '%',                                                     color: stats.pmCompliancePercent >= 80 ? C.success : stats.pmCompliancePercent >= 50 ? C.warning : C.danger, link: '/dashboard/pm-schedules/compliance' },
    { label: t('dashboard.avg_repair'),       value: stats.mttr > 0 ? stats.mttr + 'h' : '—',                                             color: C.navy,    link: '/dashboard/work-orders' },
    { label: t('dashboard.cost_mtd'),         value: stats.totalMaintenanceCost > 0 ? 'SAR ' + stats.totalMaintenanceCost.toLocaleString() : '—', color: C.navy, link: '/dashboard/work-orders' },
    { label: t('dashboard.total_assets'),     value: stats.totalAssets,                                                                   color: C.navy,    link: '/dashboard/assets' },
  ]

  const statusConfig: Record<string, { label: string; color: string }> = {
    new:         { label: t('wo.status.new'),         color: C.blue },
    assigned:    { label: t('wo.status.assigned'),    color: C.navy },
    in_progress: { label: t('wo.status.in_progress'), color: C.warning },
    on_hold:     { label: t('wo.status.on_hold'),     color: C.danger },
  }

  const priorityConfig: Record<string, { label: string; color: string }> = {
    critical: { label: t('wo.priority.critical'), color: C.danger },
    high:     { label: t('wo.priority.high'),     color: C.warning },
    medium:   { label: t('wo.priority.medium'),   color: C.warning },
    low:      { label: t('wo.priority.low'),      color: C.success },
  }

  return (
    <div style={pageStyle}>

      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>
          {userName ? greeting + ', ' + userName.split(' ')[0] : 'Dashboard'}
        </h1>
        <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '2rem' }}>
        {statCards.map(card => (
          <Link key={card.label} href={card.link} style={{ textDecoration: 'none' }}>
            <div style={{ ...cardStyle, cursor: 'pointer' }}>
              <p style={{ fontSize: 12, color: C.textLight, margin: '0 0 8px', fontWeight: 500, fontFamily: F.en }}>{card.label}</p>
              <p style={{ fontSize: 26, fontWeight: 700, margin: 0, color: card.color, fontFamily: F.en }}>{card.value}</p>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '2rem' }}>

        <div style={cardStyle}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, fontFamily: F.en, margin: '0 0 1rem' }}>{lang === 'ar' ? 'أوامر العمل المفتوحة حسب الحالة' : 'Open WOs by Status'}</p>
          {Object.keys(openByStatus).length === 0 ? (
            <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No open work orders</p>
          ) : (
            Object.entries(openByStatus).map(([status, count]) => {
              const cfg = statusConfig[status] ?? { label: status, color: C.textMid }
              const max = Math.max(...Object.values(openByStatus))
              return (
                <div key={status} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: C.textMid, fontFamily: F.en }}>{cfg.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color, fontFamily: F.en }}>{count}</span>
                  </div>
                  <div style={{ background: C.border, borderRadius: 4, height: 6 }}>
                    <div style={{ background: cfg.color, borderRadius: 4, height: 6, width: (count / max * 100) + '%' }} />
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div style={cardStyle}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, fontFamily: F.en, margin: '0 0 1rem' }}>{lang === 'ar' ? 'أوامر العمل المفتوحة حسب الأولوية' : 'Open WOs by Priority'}</p>
          {Object.keys(openByPriority).length === 0 ? (
            <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No open work orders</p>
          ) : (
            ['critical','high','medium','low'].filter(p => openByPriority[p]).map(priority => {
              const cfg = priorityConfig[priority]
              const max = Math.max(...Object.values(openByPriority))
              const count = openByPriority[priority]
              return (
                <div key={priority} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: C.textMid, fontFamily: F.en }}>{cfg.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color, fontFamily: F.en }}>{count}</span>
                  </div>
                  <div style={{ background: C.border, borderRadius: 4, height: 6 }}>
                    <div style={{ background: cfg.color, borderRadius: 4, height: 6, width: (count / max * 100) + '%' }} />
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, fontFamily: F.en, margin: 0 }}>{t('dashboard.recent_activity')}</p>
            <Link href='/dashboard/work-orders' style={{ fontSize: 12, color: C.textLight, textDecoration: 'none', fontFamily: F.en }}>{t('dashboard.view_all')}</Link>
          </div>
          {recentActivity.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No recent activity</p>
          ) : (
            recentActivity.map(log => (
              <div key={log.id} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.navy, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 13, margin: 0, color: C.textDark, fontFamily: F.en }}>{lang === 'ar' ? log.action.replace('assigned', 'مُعيَّن').replace('in_progress', 'قيد التنفيذ').replace('on_hold', 'معلق').replace('completed', 'مكتمل').replace('closed', 'مغلق').replace('Status changed to', 'تم تغيير الحالة إلى') : log.action}</p>
                  <p style={{ fontSize: 11, color: C.textLight, margin: '2px 0 0', fontFamily: F.en }}>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.navy, fontFamily: F.en, margin: 0 }}>{t('dashboard.upcoming_pm')}</p>
            <Link href='/dashboard/pm-schedules' style={{ fontSize: 12, color: C.textLight, textDecoration: 'none', fontFamily: F.en }}>{t('dashboard.view_all')}</Link>
          </div>
          {upcomingPMs.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No upcoming PM tasks</p>
          ) : (
            upcomingPMs.map(pm => {
              const days = Math.ceil((new Date(pm.next_due_at).getTime() - Date.now()) / 86400000)
              return (
                <div key={pm.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: C.textDark, fontFamily: F.en, margin: 0 }}>{pm.title}</p>
                    <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '2px 0 0' }}>{pm.asset?.name ?? 'No asset'} · {pm.assignee?.full_name ?? t('common.unassigned')}</p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: days <= 1 ? C.danger : days <= 7 ? C.warning : C.success, whiteSpace: 'nowrap', marginLeft: 8, fontFamily: F.en }}>
                    {days === 0 ? t('dashboard.today') : days === 1 ? t('dashboard.tomorrow') : 'In ' + days + ' days'}
                  </span>
                </div>
              )
            })
          )}
        </div>

      </div>

      <div style={{ marginTop: '2rem', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href='/dashboard/work-orders/new'>
          <button style={{ background: C.navy, color: C.white, padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 14, fontFamily: F.en }}>{t('dashboard.new_wo')}</button>
        </Link>
        <Link href='/dashboard/assets/new'>
          <button style={{ background: C.white, color: C.navy, padding: '9px 20px', borderRadius: 8, border: `1px solid ${C.navy}`, cursor: 'pointer', fontWeight: 500, fontSize: 14, fontFamily: F.en }}>{t('dashboard.add_asset')}</button>
        </Link>
        <Link href='/dashboard/pm-schedules/new'>
          <button style={{ background: C.white, color: C.navy, padding: '9px 20px', borderRadius: 8, border: `1px solid ${C.navy}`, cursor: 'pointer', fontWeight: 500, fontSize: 14, fontFamily: F.en }}>{t('dashboard.new_pm')}</button>
        </Link>
        <Link href='/dashboard/pm-schedules/compliance'>
          <button style={{ background: C.white, color: C.navy, padding: '9px 20px', borderRadius: 8, border: `1px solid ${C.navy}`, cursor: 'pointer', fontWeight: 500, fontSize: 14, fontFamily: F.en }}>{t('dashboard.pm_compliance_btn')}</button>
        </Link>
      </div>

    </div>
  )
}
