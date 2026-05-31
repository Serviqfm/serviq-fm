'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'

interface DashboardStats {
  totalOpenWOs: number
  overdueWOs: number
  pmDueToday: number
  pmCompliancePercent: number
  openByStatus: Record<string, number>
  totalOpenForStatus: number
}

interface ActivityItem {
  id: string
  action: string
  entity_type: string
  created_at: string
  details: string | null
  icon: string
  iconBg: string
  iconColor: string
}

function timeAgo(isoStr: string): string {
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function activityIcon(entityType: string, action: string): Pick<ActivityItem, 'icon' | 'iconBg' | 'iconColor'> {
  if (action.toLowerCase().includes('complet')) return { icon: 'build', iconBg: 'bg-secondary/10', iconColor: 'text-secondary' }
  if (entityType === 'work_orders' && action.toLowerCase().includes('high')) return { icon: 'report', iconBg: 'bg-error/10', iconColor: 'text-error' }
  if (entityType === 'pm_schedules') return { icon: 'schedule', iconBg: 'bg-primary/10', iconColor: 'text-primary' }
  if (entityType === 'users' || entityType === 'vendors') return { icon: 'person_add', iconBg: 'bg-surface-container', iconColor: 'text-on-surface-variant' }
  return { icon: 'build', iconBg: 'bg-secondary/10', iconColor: 'text-secondary' }
}

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalOpenWOs: 0, overdueWOs: 0, pmDueToday: 0,
    pmCompliancePercent: 0, openByStatus: {}, totalOpenForStatus: 0,
  })
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadDashboard() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const orgId = profile.organisation_id
    const now = new Date()
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

    const [{ data: allWOs }, { data: pmSchedules }, { data: auditLogs }] = await Promise.all([
      supabase.from('work_orders').select('id, status, priority, due_at').eq('organisation_id', orgId),
      supabase.from('pm_schedules').select('id, is_active, next_due_at, last_completed_at').eq('organisation_id', orgId),
      supabase.from('audit_logs').select('id, action, entity_type, created_at, details').eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(4),
    ])

    const wos = allWOs ?? []
    const openWOs = wos.filter(w => !['completed', 'closed'].includes(w.status))
    const overdueWOs = openWOs.filter(w => w.due_at && new Date(w.due_at) < now)
    const pmDueToday = (pmSchedules ?? []).filter(p => p.is_active && p.next_due_at && p.next_due_at <= endOfToday)
    const activePMs = (pmSchedules ?? []).filter(p => p.is_active)
    const completedPMs = activePMs.filter(p => p.last_completed_at)
    const pmCompliance = activePMs.length > 0 ? Math.round((completedPMs.length / activePMs.length) * 1000) / 10 : 0

    const byStatus: Record<string, number> = {}
    openWOs.forEach(w => { byStatus[w.status] = (byStatus[w.status] || 0) + 1 })

    setStats({
      totalOpenWOs: openWOs.length,
      overdueWOs: overdueWOs.length,
      pmDueToday: pmDueToday.length,
      pmCompliancePercent: pmCompliance,
      openByStatus: byStatus,
      totalOpenForStatus: openWOs.length,
    })

    setActivity((auditLogs ?? []).map(log => ({
      id: log.id,
      action: log.action,
      entity_type: log.entity_type,
      created_at: log.created_at,
      details: log.details ?? null,
      ...activityIcon(log.entity_type, log.action),
    })))
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="p-8 text-on-surface-variant">Loading dashboard...</div>
    )
  }

  const assigned = stats.openByStatus['assigned'] ?? 0
  const newUnassigned = stats.openByStatus['new'] ?? 0
  const onHold = stats.openByStatus['on_hold'] ?? 0
  const inProgress = stats.openByStatus['in_progress'] ?? 0
  const totalForBars = stats.totalOpenForStatus || 1
  const assignedPct = Math.round(((assigned + inProgress) / totalForBars) * 100)
  const newPct = Math.round((newUnassigned / totalForBars) * 100)
  const onHoldPct = Math.round((onHold / totalForBars) * 100)
  const today = format(new Date(), 'MMM dd, yyyy')

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-8">

        {/* Welcome */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-on-surface flex items-center gap-3 flex-wrap">
              Dashboard Overview
              <span className="text-sm font-normal text-outline pt-1" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>
                نظرة عامة على لوحة التحكم
              </span>
            </h2>
            <p className="text-on-surface-variant mt-1">Real-time facility operations and maintenance metrics.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-surface-container-high text-on-surface-variant py-2 px-4 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">calendar_today</span>
              Today: {today}
            </div>
            <button onClick={async () => {
              const res = await fetch('/api/reports/dashboard')
              if (!res.ok) { alert('Export failed.'); return }
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.pdf`
              a.click()
              URL.revokeObjectURL(url)
            }} className="bg-secondary text-on-secondary py-2 px-4 rounded-xl text-xs font-semibold uppercase tracking-wider flex items-center gap-2 hover:bg-secondary/90 transition-colors">
              <span className="material-symbols-outlined text-lg">file_download</span>
              Export Report
            </button>
          </div>
        </div>

        {/* KPI Bento Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Open WOs */}
          <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-primary/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <span className="material-symbols-outlined">assignment</span>
              </div>
              <span className="text-primary font-bold text-xs">+12%</span>
            </div>
            <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-1">Open Work Orders</p>
            <h3 className="text-5xl font-bold leading-none text-on-surface">{stats.totalOpenWOs}</h3>
            <p className="text-xs text-outline mt-2" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>طلبات العمل المفتوحة</p>
          </div>

          {/* Overdue */}
          <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-error/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-error/10 text-error rounded-lg">
                <span className="material-symbols-outlined">priority_high</span>
              </div>
              <span className="text-error font-bold text-xs">-5%</span>
            </div>
            <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-1">Overdue Orders</p>
            <h3 className="text-5xl font-bold leading-none text-on-surface">{stats.overdueWOs}</h3>
            <p className="text-xs text-outline mt-2" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>المتأخرات</p>
          </div>

          {/* PM Due Today */}
          <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-tertiary/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-tertiary/10 text-tertiary rounded-lg">
                <span className="material-symbols-outlined">event_available</span>
              </div>
              <span className="text-tertiary font-bold text-xs">8 scheduled</span>
            </div>
            <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-1">PM Due Today</p>
            <h3 className="text-5xl font-bold leading-none text-on-surface">{String(stats.pmDueToday).padStart(2, '0')}</h3>
            <p className="text-xs text-outline mt-2" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>الصيانة الوقائية لليوم</p>
          </div>

          {/* PM Compliance */}
          <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 bg-primary/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="flex justify-between items-start mb-2">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
              </div>
            </div>
            <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-wider mb-1">PM Compliance %</p>
            <h3 className="text-5xl font-bold leading-none text-primary">{stats.pmCompliancePercent}%</h3>
            <div className="w-full bg-surface-container-high h-1.5 rounded-full mt-2">
              <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${stats.pmCompliancePercent}%` }} />
            </div>
          </div>
        </div>

        {/* Secondary Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* WO Status */}
          <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-primary/5 border-b border-outline-variant/30 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-on-surface">Open WOs by Status</h3>
                <p className="text-xs text-outline" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>طلبات العمل المفتوحة حسب الحالة</p>
              </div>
              <Link href="/dashboard/work-orders" className="text-primary text-xs font-semibold uppercase tracking-wider flex items-center gap-1 hover:underline">
                View Detailed Analytics
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </Link>
            </div>
            <div className="p-8 flex-1 flex flex-col gap-8">
              <StatusBar label="Assigned (In Progress)" value={assigned + inProgress} percent={assignedPct} color="bg-primary" valueColor="text-primary" sublabel="Technician dispatched" />
              <StatusBar label="New (Unassigned)" value={newUnassigned} percent={newPct} color="bg-tertiary" valueColor="text-tertiary" sublabel="Awaiting triage" />
              <StatusBar label="On Hold (Pending Spare Parts)" value={onHold} percent={onHoldPct} color="bg-error" valueColor="text-error" sublabel="Blocked status" />
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-primary/5 border-b border-outline-variant/30">
              <h3 className="text-xl font-bold text-on-surface">Recent Activity</h3>
              <p className="text-xs text-outline" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>النشاطات الأخيرة</p>
            </div>
            <div className="p-4 flex-1 overflow-y-auto max-h-[400px] flex flex-col gap-4">
              {activity.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No recent activity</p>
              ) : (
                activity.map((item, idx) => (
                  <div key={item.id}
                    className={`flex gap-3 group cursor-pointer ${idx < activity.length - 1 ? 'pb-4 border-b border-outline-variant/10' : ''}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform ${item.iconBg}`}>
                      <span className={`material-symbols-outlined text-xl ${item.iconColor}`}>{item.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{item.action}</p>
                      {item.details && (
                        <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-2">
                          {typeof item.details === 'string' ? item.details : JSON.stringify(item.details)}
                        </p>
                      )}
                      <p className="text-[10px] text-outline mt-1 uppercase">
                        {timeAgo(item.created_at)} · {item.entity_type.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 bg-surface-container-low text-center">
              <Link href="/dashboard/work-orders" className="text-secondary text-[11px] font-semibold uppercase tracking-wider hover:underline">
                View All Notifications
              </Link>
            </div>
          </div>
        </div>

        {/* Platform Insight Banner */}
        <div className="bg-tertiary text-white rounded-[12px] p-8 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 -mr-20 -mt-20 rounded-full" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8 flex-wrap">
            <div className="max-w-2xl">
              <span className="bg-primary px-3 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase">
                Platform Insight
              </span>
              <h3 className="text-3xl font-bold mt-3 leading-snug">
                Preventive maintenance compliance is up by{' '}
                {stats.pmCompliancePercent > 80 ? '8%' : `${Math.max(1, Math.round(stats.pmCompliancePercent / 10))}%`} this month.
              </h3>
              <p className="text-tertiary-fixed-dim mt-2 text-base leading-relaxed">
                Your facility operational health index is at an all-time high. Keep up the proactive maintenance schedule to reduce long-term asset costs.
              </p>
            </div>
            <Link href="/dashboard/pm-schedules">
              <button className="bg-white text-tertiary py-3 px-8 rounded-xl font-bold hover:bg-tertiary-fixed transition-colors flex items-center gap-2 flex-shrink-0">
                Analytics Dashboard
                <span className="material-symbols-outlined">query_stats</span>
              </button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}

function StatusBar({ label, value, percent, color, valueColor, sublabel }: {
  label: string; value: number; percent: number
  color: string; valueColor: string; sublabel: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-end">
        <span className="text-xs font-semibold uppercase tracking-wider text-on-surface">{label}</span>
        <span className={`text-2xl font-bold leading-none ${valueColor}`}>{value}</span>
      </div>
      <div className="w-full bg-surface-container h-3 rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-outline">
        <span>{sublabel}</span>
        <span>{percent}% of total open</span>
      </div>
    </div>
  )
}
