'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { usePollingRefresh } from '@/lib/usePollingRefresh'
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

interface UpcomingPM {
  id: string
  title: string
  next_due_at: string
  assetName: string | null
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
  const [upcomingPM, setUpcomingPM] = useState<UpcomingPM[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => { loadDashboard() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // CORE-35: live KPIs — re-run get_dashboard_stats + feeds on an interval so the
  // dashboard reflects new/closed WOs without a manual reload.
  usePollingRefresh(loadDashboard, 45_000)

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const orgId = profile.organisation_id

    // Aggregates are computed server-side (get_dashboard_stats derives the org from
    // auth.uid()); only the small recent-activity feed is fetched directly.
    const [{ data: statsRow }, { data: auditLogs }, { data: pmRows }] = await Promise.all([
      supabase.rpc('get_dashboard_stats'),
      supabase.from('audit_logs').select('id, action, entity_type, created_at, details').eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(20),
      // CORE-14: active PM schedules due within the next 7 days (same query shape as the PM calendar page).
      supabase.from('pm_schedules').select('id, title, next_due_at, asset:asset_id(name)')
        .eq('organisation_id', orgId).eq('is_active', true)
        .not('next_due_at', 'is', null)
        .lte('next_due_at', new Date(Date.now() + 7 * 86400000).toISOString())
        .order('next_due_at', { ascending: true }).limit(10),
    ])

    const s = (statsRow ?? {}) as unknown as Partial<DashboardStats>
    const totalOpen = s.totalOpenWOs ?? 0
    setStats({
      totalOpenWOs: totalOpen,
      overdueWOs: s.overdueWOs ?? 0,
      pmDueToday: s.pmDueToday ?? 0,
      pmCompliancePercent: s.pmCompliancePercent ?? 0,
      openByStatus: s.openByStatus ?? {},
      totalOpenForStatus: totalOpen,
    })

    setActivity((auditLogs ?? []).map(log => ({
      id: log.id,
      action: log.action,
      entity_type: log.entity_type,
      created_at: log.created_at,
      details: log.details ?? null,
      ...activityIcon(log.entity_type, log.action),
    })))

    setUpcomingPM((pmRows ?? []).map(pm => ({
      id: pm.id,
      title: pm.title,
      next_due_at: pm.next_due_at as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assetName: (pm.asset as any)?.name ?? null,
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
  const assignedPct = Math.round((assigned / totalForBars) * 100)
  const inProgressPct = Math.round((inProgress / totalForBars) * 100)
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
              <StatusBar label="Assigned" value={assigned} percent={assignedPct} color="bg-primary" valueColor="text-primary" sublabel="Technician dispatched" />
              <StatusBar label="In Progress" value={inProgress} percent={inProgressPct} color="bg-secondary" valueColor="text-secondary" sublabel="Work underway" />
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

        {/* Upcoming PM + Quick Actions (CORE-14) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Upcoming PM (7 days) */}
          <div className="lg:col-span-2 bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-primary/5 border-b border-outline-variant/30 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-on-surface">Upcoming PM (7 days)</h3>
                <p className="text-xs text-outline" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>الصيانة الوقائية القادمة (٧ أيام)</p>
              </div>
              <Link href="/dashboard/pm-schedules/calendar" className="text-primary text-xs font-semibold uppercase tracking-wider flex items-center gap-1 hover:underline">
                View Calendar
                <span className="material-symbols-outlined text-base">arrow_forward</span>
              </Link>
            </div>
            <div className="p-4 flex-1 overflow-y-auto max-h-[320px] flex flex-col gap-3">
              {upcomingPM.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No PM due in the next 7 days</p>
              ) : (
                upcomingPM.map((pm, idx) => {
                  const overdue = new Date(pm.next_due_at).getTime() < Date.now()
                  return (
                    <div key={pm.id} className={`flex items-center gap-3 ${idx < upcomingPM.length - 1 ? 'pb-3 border-b border-outline-variant/10' : ''}`}>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${overdue ? 'bg-error/10' : 'bg-primary/10'}`}>
                        <span className={`material-symbols-outlined text-xl ${overdue ? 'text-error' : 'text-primary'}`}>schedule</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-on-surface truncate">{pm.title}</p>
                        {pm.assetName && <p className="text-xs text-on-surface-variant truncate">{pm.assetName}</p>}
                      </div>
                      <span className={`text-xs font-semibold flex-shrink-0 ${overdue ? 'text-error' : 'text-on-surface-variant'}`}>
                        {format(new Date(pm.next_due_at), 'MMM dd')}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 bg-primary/5 border-b border-outline-variant/30">
              <h3 className="text-xl font-bold text-on-surface">Quick Actions</h3>
              <p className="text-xs text-outline" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>إجراءات سريعة</p>
            </div>
            <div className="p-4 flex-1 flex flex-col gap-3">
              <QuickAction href="/dashboard/work-orders/new" icon="add_task" labelEn="New Work Order" labelAr="طلب عمل جديد" />
              <QuickAction href="/dashboard/pm-schedules/new" icon="event_repeat" labelEn="New PM Schedule" labelAr="جدول صيانة وقائية جديد" />
              <QuickAction href="/dashboard/reports" icon="monitoring" labelEn="Reports" labelAr="التقارير" />
            </div>
          </div>
        </div>

        {/* PM shortcut (replaces the former fabricated "Platform Insight" banner — CORE-12) */}
        <div className="bg-tertiary text-white rounded-[12px] p-8 relative overflow-hidden shadow-xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 -mr-20 -mt-20 rounded-full" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8 flex-wrap">
            <div className="max-w-2xl">
              <span className="bg-primary px-3 py-1 rounded-full text-[10px] font-semibold tracking-widest uppercase">
                Preventive Maintenance
              </span>
              <h3 className="text-3xl font-bold mt-3 leading-snug">
                PM compliance is at {stats.pmCompliancePercent}%.
              </h3>
              <p className="text-tertiary-fixed-dim mt-2 text-base leading-relaxed">
                Keep active schedules on track to reduce long-term asset costs.
              </p>
            </div>
            <Link href="/dashboard/pm-schedules">
              <button className="bg-white text-tertiary py-3 px-8 rounded-xl font-bold hover:bg-tertiary-fixed transition-colors flex items-center gap-2 flex-shrink-0">
                View PM Schedules
                <span className="material-symbols-outlined">query_stats</span>
              </button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}

function QuickAction({ href, icon, labelEn, labelAr }: { href: string; icon: string; labelEn: string; labelAr: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 p-3 rounded-xl border border-outline-variant bg-surface-container-low hover:bg-primary/5 transition-colors group">
      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
        <span className="material-symbols-outlined text-xl">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-on-surface">{labelEn}</p>
        <p className="text-xs text-outline" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>{labelAr}</p>
      </div>
      <span className="material-symbols-outlined text-base text-outline group-hover:text-primary transition-colors">arrow_forward</span>
    </Link>
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
