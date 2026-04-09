'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalOpenWOs: 0,
    overdueWOs: 0,
    pmDueToday: 0,
    completedThisMonth: 0,
    totalAssets: 0,
    activeAssets: 0,
    pmCompliancePercent: 0,
  })
  const [recentActivity, setRecentActivity] = useState<any[]>([])
  const [upcomingPMs, setUpcomingPMs] = useState<any[]>([])
  const [openByStatus, setOpenByStatus] = useState<Record<string, number>>({})
  const [openByPriority, setOpenByPriority] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const supabase = createClient()

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id, full_name').eq('id', user.id).single()
    if (!profile) return
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
    ] = await Promise.all([
      supabase.from('work_orders').select('id, status, priority, due_at, created_at, title').eq('organisation_id', orgId),
      supabase.from('assets').select('id, status').eq('organisation_id', orgId),
      supabase.from('pm_schedules').select('id, is_active, next_due_at, last_completed_at').eq('organisation_id', orgId),
      supabase.from('audit_logs').select('id, action, entity_type, created_at').eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(15),
      supabase.from('pm_schedules').select('id, title, next_due_at, asset:asset_id(name), assignee:assigned_to(full_name)').eq('organisation_id', orgId).eq('is_active', true).gte('next_due_at', now.toISOString()).order('next_due_at', { ascending: true }).limit(7),
    ])

    const wos = allWOs ?? []
    const openWOs = wos.filter(w => !['completed','closed'].includes(w.status))
    const overdueWOs = openWOs.filter(w => w.due_at && new Date(w.due_at) < now)
    const completedThisMonth = wos.filter(w => w.status === 'completed' && w.created_at >= startOfMonth)

    const pmDueToday = (pmSchedules ?? []).filter(p => p.is_active && p.next_due_at && p.next_due_at <= endOfToday)
    const activePMs = (pmSchedules ?? []).filter(p => p.is_active)
    const completedPMs = activePMs.filter(p => p.last_completed_at)
    const pmCompliance = activePMs.length > 0 ? Math.round((completedPMs.length / activePMs.length) * 100) : 0

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
    })
    setOpenByStatus(byStatus)
    setOpenByPriority(byPriority)
    setRecentActivity(auditLogs ?? [])
    setUpcomingPMs(upcoming ?? [])
    setLoading(false)
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading dashboard...</div>

  const statCards = [
    { label: 'Open Work Orders', value: stats.totalOpenWOs, color: '#1a1a2e', link: '/dashboard/work-orders' },
    { label: 'Overdue', value: stats.overdueWOs, color: stats.overdueWOs > 0 ? '#c62828' : '#2e7d32', link: '/dashboard/work-orders' },
    { label: 'PM Due Today', value: stats.pmDueToday, color: stats.pmDueToday > 0 ? '#f57f17' : '#2e7d32', link: '/dashboard/pm-schedules' },
    { label: 'Completed This Month', value: stats.completedThisMonth, color: '#2e7d32', link: '/dashboard/work-orders' },
    { label: 'Total Assets', value: stats.totalAssets, color: '#1a1a2e', link: '/dashboard/assets' },
    { label: 'PM Compliance', value: stats.pmCompliancePercent + '%', color: stats.pmCompliancePercent >= 80 ? '#2e7d32' : stats.pmCompliancePercent >= 50 ? '#f57f17' : '#c62828', link: '/dashboard/pm-schedules' },
  ]

  const statusConfig: Record<string, { label: string; color: string }> = {
    new:         { label: 'New',         color: '#0d47a1' },
    assigned:    { label: 'Assigned',    color: '#283593' },
    in_progress: { label: 'In Progress', color: '#f57f17' },
    on_hold:     { label: 'On Hold',     color: '#880e4f' },
  }

  const priorityConfig: Record<string, { label: string; color: string }> = {
    critical: { label: 'Critical', color: '#b71c1c' },
    high:     { label: 'High',     color: '#e65100' },
    medium:   { label: 'Medium',   color: '#f57f17' },
    low:      { label: 'Low',      color: '#2e7d32' },
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1200, margin: '0 auto' }}>

      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
          {userName ? 'Good ' + (new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening') + ', ' + userName.split(' ')[0] : 'Dashboard'}
        </h1>
        <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '2rem' }}>
        {statCards.map(card => (
          <Link key={card.label} href={card.link} style={{ textDecoration: 'none' }}>
            <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem', cursor: 'pointer', transition: 'border-color 0.15s' }}>
              <p style={{ fontSize: 12, color: '#999', margin: '0 0 8px', fontWeight: 500 }}>{card.label}</p>
              <p style={{ fontSize: 32, fontWeight: 700, margin: 0, color: card.color }}>{card.value}</p>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '2rem' }}>

        <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem' }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 1rem' }}>Open WOs by Status</p>
          {Object.keys(openByStatus).length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No open work orders</p>
          ) : (
            Object.entries(openByStatus).map(([status, count]) => {
              const cfg = statusConfig[status] ?? { label: status, color: '#666' }
              const max = Math.max(...Object.values(openByStatus))
              return (
                <div key={status} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: '#444' }}>{cfg.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{count}</span>
                  </div>
                  <div style={{ background: '#f0f0f0', borderRadius: 4, height: 6 }}>
                    <div style={{ background: cfg.color, borderRadius: 4, height: 6, width: (count / max * 100) + '%' }} />
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem' }}>
          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 1rem' }}>Open WOs by Priority</p>
          {Object.keys(openByPriority).length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No open work orders</p>
          ) : (
            ['critical','high','medium','low'].filter(p => openByPriority[p]).map(priority => {
              const cfg = priorityConfig[priority]
              const max = Math.max(...Object.values(openByPriority))
              const count = openByPriority[priority]
              return (
                <div key={priority} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: '#444' }}>{cfg.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{count}</span>
                  </div>
                  <div style={{ background: '#f0f0f0', borderRadius: 4, height: 6 }}>
                    <div style={{ background: cfg.color, borderRadius: 4, height: 6, width: (count / max * 100) + '%' }} />
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Recent Activity</p>
            <Link href='/dashboard/work-orders' style={{ fontSize: 12, color: '#999', textDecoration: 'none' }}>View all</Link>
          </div>
          {recentActivity.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No recent activity</p>
          ) : (
            recentActivity.map(log => (
              <div key={log.id} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#1a1a2e', marginTop: 5, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 13, margin: 0, color: '#333' }}>{log.action}</p>
                  <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0' }}>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Upcoming PM Tasks</p>
            <Link href='/dashboard/pm-schedules' style={{ fontSize: 12, color: '#999', textDecoration: 'none' }}>View all</Link>
          </div>
          {upcomingPMs.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No upcoming PM tasks</p>
          ) : (
            upcomingPMs.map(pm => {
              const days = Math.ceil((new Date(pm.next_due_at).getTime() - Date.now()) / 86400000)
              return (
                <div key={pm.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f5f5f5' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{pm.title}</p>
                    <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>{pm.asset?.name ?? 'No asset'} · {pm.assignee?.full_name ?? 'Unassigned'}</p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: days <= 1 ? '#c62828' : days <= 7 ? '#f57f17' : '#2e7d32', whiteSpace: 'nowrap', marginLeft: 8 }}>
                    {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : 'In ' + days + ' days'}
                  </span>
                </div>
              )
            })
          )}
        </div>

      </div>

      <div style={{ marginTop: '2rem', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href='/dashboard/work-orders/new'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>+ New Work Order</button>
        </Link>
        <Link href='/dashboard/assets/new'>
          <button style={{ background: 'white', color: '#1a1a2e', padding: '9px 20px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>+ Add Asset</button>
        </Link>
        <Link href='/dashboard/pm-schedules/new'>
          <button style={{ background: 'white', color: '#1a1a2e', padding: '9px 20px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>+ New PM Schedule</button>
        </Link>
      </div>

    </div>
  )
}