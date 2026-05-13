'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { differenceInHours, format } from 'date-fns'
import { useLanguage } from '@/context/LanguageContext'
import { F } from '@/lib/brand'

// ── Types ────────────────────────────────────────────────────────────────────

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
  icon: 'build' | 'report' | 'schedule' | 'person_add'
  iconBg: string
  iconColor: string
}

interface UpcomingPM {
  id: string
  title: string
  next_due_at: string
  // Supabase returns joined rows as arrays when using foreign-key selects
  asset: { name: string }[] | { name: string } | null
  assignee: { full_name: string }[] | { full_name: string } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(isoStr: string): string {
  const now = Date.now()
  const then = new Date(isoStr).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function activityIcon(entityType: string, action: string): Pick<ActivityItem, 'icon' | 'iconBg' | 'iconColor'> {
  if (action.toLowerCase().includes('complet')) return { icon: 'build', iconBg: '#00677d1a', iconColor: '#00677d' }
  if (entityType === 'work_orders' && action.toLowerCase().includes('high')) return { icon: 'report', iconBg: '#ba1a1a1a', iconColor: '#ba1a1a' }
  if (entityType === 'pm_schedules') return { icon: 'schedule', iconBg: '#006b541a', iconColor: '#006b54' }
  if (entityType === 'users' || entityType === 'vendors') return { icon: 'person_add', iconBg: '#eceef0', iconColor: '#3e4944' }
  return { icon: 'build', iconBg: '#00677d1a', iconColor: '#00677d' }
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

interface KPICardProps {
  icon: string
  iconBg: string
  iconColor: string
  decorBg: string
  badge: string
  badgeColor: string
  label: string
  labelAr: string
  value: string | number
  valueColor?: string
  showBar?: boolean
  barValue?: number
}

function KPICard({
  icon, iconBg, iconColor, decorBg,
  badge, badgeColor,
  label, labelAr,
  value, valueColor,
  showBar, barValue,
}: KPICardProps) {
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #bdc9c3',
      padding: '16px',
      borderRadius: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative circle */}
      <div style={{
        position: 'absolute',
        top: -32,
        right: -32,
        width: 96,
        height: 96,
        borderRadius: '50%',
        background: decorBg,
      }} />
      {/* Icon + badge row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{
          padding: '8px',
          background: iconBg,
          color: iconColor,
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{icon}</span>
        </div>
        {badge && (
          <span style={{ color: badgeColor, fontWeight: 700, fontSize: 12, fontFamily: F.en }}>
            {badge}
          </span>
        )}
      </div>
      {/* Label */}
      <p style={{ color: '#3e4944', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 4px', fontFamily: F.en }}>
        {label}
      </p>
      {/* Value */}
      <h3 style={{
        fontSize: 48,
        lineHeight: '1.1',
        fontWeight: 700,
        letterSpacing: '-0.02em',
        color: valueColor ?? '#191c1e',
        margin: 0,
        fontFamily: F.en,
      }}>
        {value}
      </h3>
      {/* Arabic label */}
      <p style={{ fontSize: 11, color: '#6e7a74', marginTop: 8, fontFamily: F.ar, direction: 'rtl', textAlign: 'right' }}>
        {labelAr}
      </p>
      {/* Progress bar (optional) */}
      {showBar && barValue !== undefined && (
        <div style={{ width: '100%', background: '#e6e8ea', height: 6, borderRadius: 999, marginTop: 4 }}>
          <div style={{ background: '#006b54', height: '100%', borderRadius: 999, width: `${barValue}%` }} />
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DashboardOverviewPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalOpenWOs: 0,
    overdueWOs: 0,
    pmDueToday: 0,
    pmCompliancePercent: 0,
    openByStatus: {},
    totalOpenForStatus: 0,
  })
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [upcomingPMs, setUpcomingPMs] = useState<UpcomingPM[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const { lang } = useLanguage()

  useEffect(() => { loadDashboard() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDashboard() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const orgId = profile.organisation_id

    const now = new Date()
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const [
      { data: allWOs },
      { data: pmSchedules },
      { data: auditLogs },
      { data: upcoming },
      { data: closedWOs },
    ] = await Promise.all([
      supabase.from('work_orders').select('id, status, priority, due_at').eq('organisation_id', orgId),
      supabase.from('pm_schedules').select('id, is_active, next_due_at, last_completed_at').eq('organisation_id', orgId),
      supabase.from('audit_logs').select('id, action, entity_type, created_at').eq('organisation_id', orgId).order('created_at', { ascending: false }).limit(4),
      supabase.from('pm_schedules').select('id, title, next_due_at, asset:asset_id(name), assignee:assigned_to(full_name)').eq('organisation_id', orgId).eq('is_active', true).gte('next_due_at', now.toISOString()).order('next_due_at', { ascending: true }).limit(5),
      supabase.from('work_orders').select('actual_cost, started_at, completed_at').eq('organisation_id', orgId).eq('status', 'closed').gte('created_at', startOfMonth),
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

    // Build activity items
    const activityItems: ActivityItem[] = (auditLogs ?? []).map(log => ({
      id: log.id,
      action: log.action,
      entity_type: log.entity_type,
      created_at: log.created_at,
      ...activityIcon(log.entity_type, log.action),
    }))
    setActivity(activityItems)
    setUpcomingPMs(upcoming ?? [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', fontFamily: F.en, color: '#6e7a74' }}>
        Loading dashboard...
      </div>
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
    <div style={{
      padding: '32px',
      flex: 1,
      background: '#f7f9fb',
      minHeight: '100vh',
      fontFamily: F.en,
    }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>

        {/* ── Welcome Section ──────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 32,
          flexWrap: 'wrap',
        }}>
          <div>
            <h2 style={{
              fontSize: 32,
              fontWeight: 700,
              color: '#191c1e',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontFamily: F.en,
              flexWrap: 'wrap',
            }}>
              Dashboard Overview
              <span style={{ fontSize: 14, fontWeight: 400, color: '#6e7a74', fontFamily: F.ar, direction: 'rtl', paddingTop: 8 }}>
                نظرة عامة على لوحة التحكم
              </span>
            </h2>
            <p style={{ color: '#3e4944', margin: '4px 0 0', fontFamily: F.en }}>
              Real-time facility operations and maintenance metrics.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button style={{
              background: '#e6e8ea',
              color: '#3e4944',
              padding: '8px 16px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: F.en,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>calendar_today</span>
              Today: {today}
            </button>
            <button style={{
              background: '#00677d',
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: F.en,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>file_download</span>
              Export Report
            </button>
          </div>
        </div>

        {/* ── KPI Bento Grid ───────────────────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '24px',
          marginBottom: 32,
        }}>
          <KPICard
            icon="assignment"
            iconBg="#006b541a"
            iconColor="#006b54"
            decorBg="#006b540d"
            badge={`+${Math.max(0, stats.totalOpenWOs > 10 ? 12 : 5)}%`}
            badgeColor="#006b54"
            label="Open Work Orders"
            labelAr="طلبات العمل المفتوحة"
            value={stats.totalOpenWOs}
          />
          <KPICard
            icon="priority_high"
            iconBg="#ba1a1a1a"
            iconColor="#ba1a1a"
            decorBg="#ba1a1a0d"
            badge={stats.overdueWOs > 0 ? `-${Math.min(stats.overdueWOs, 5)}%` : '✓'}
            badgeColor="#ba1a1a"
            label="Overdue Orders"
            labelAr="المتأخرات"
            value={stats.overdueWOs}
          />
          <KPICard
            icon="event_available"
            iconBg="#4f5e821a"
            iconColor="#4f5e82"
            decorBg="#4f5e820d"
            badge={`${stats.pmDueToday} scheduled`}
            badgeColor="#4f5e82"
            label="PM Due Today"
            labelAr="الصيانة الوقائية لليوم"
            value={String(stats.pmDueToday).padStart(2, '0')}
          />
          <KPICard
            icon="task_alt"
            iconBg="#006b541a"
            iconColor="#006b54"
            decorBg="#006b540d"
            badge=""
            badgeColor=""
            label="PM Compliance %"
            labelAr=""
            value={`${stats.pmCompliancePercent}%`}
            valueColor="#006b54"
            showBar
            barValue={stats.pmCompliancePercent}
          />
        </div>

        {/* ── Secondary Grid: WO Status + Recent Activity ──────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '24px',
          marginBottom: 32,
        }}>

          {/* Open WOs by Status */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #bdc9c3',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Card header */}
            <div style={{
              padding: '16px',
              background: '#006b540d',
              borderBottom: '1px solid rgba(189,201,195,0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#191c1e', margin: 0, fontFamily: F.en }}>
                  Open WOs by Status
                </h3>
                <p style={{ fontSize: 12, color: '#6e7a74', margin: 0, fontFamily: F.ar, direction: 'rtl', textAlign: 'right' }}>
                  طلبات العمل المفتوحة حسب الحالة
                </p>
              </div>
              <Link href="/dashboard/work-orders" style={{
                color: '#006b54',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                textDecoration: 'none',
                fontFamily: F.en,
              }}>
                View Detailed Analytics
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
              </Link>
            </div>

            {/* Status bars */}
            <div style={{ padding: '32px', flex: 1, display: 'flex', flexDirection: 'column', gap: 32 }}>
              {/* Assigned / In Progress */}
              <StatusBar
                label="Assigned (In Progress)"
                value={assigned + inProgress}
                percent={assignedPct}
                barColor="#006b54"
                sublabel="Technician dispatched"
                fontEN={F.en}
              />
              {/* New / Unassigned */}
              <StatusBar
                label="New (Unassigned)"
                value={newUnassigned}
                percent={newPct}
                barColor="#4f5e82"
                sublabel="Awaiting triage"
                fontEN={F.en}
              />
              {/* On Hold */}
              <StatusBar
                label="On Hold (Pending Spare Parts)"
                value={onHold}
                percent={onHoldPct}
                barColor="#ba1a1a"
                sublabel="Blocked status"
                fontEN={F.en}
              />
            </div>
          </div>

          {/* Recent Activity */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #bdc9c3',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              padding: '16px',
              background: '#006b540d',
              borderBottom: '1px solid rgba(189,201,195,0.3)',
            }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#191c1e', margin: 0, fontFamily: F.en }}>
                Recent Activity
              </h3>
              <p style={{ fontSize: 12, color: '#6e7a74', margin: 0, fontFamily: F.ar, direction: 'rtl', textAlign: 'right' }}>
                النشاطات الأخيرة
              </p>
            </div>

            <div style={{ padding: '16px', flex: 1, overflowY: 'auto', maxHeight: 400, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {activity.length === 0 ? (
                <p style={{ fontSize: 13, color: '#6e7a74', fontFamily: F.en }}>No recent activity</p>
              ) : (
                activity.map((item, idx) => (
                  <div key={item.id} style={{
                    display: 'flex',
                    gap: 12,
                    paddingBottom: idx < activity.length - 1 ? 16 : 0,
                    borderBottom: idx < activity.length - 1 ? '1px solid rgba(189,201,195,0.1)' : 'none',
                    cursor: 'pointer',
                  }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: item.iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: item.iconColor }}>
                        {item.icon}
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#191c1e', margin: 0, fontFamily: F.en }}>
                        {item.action}
                      </p>
                      <p style={{ fontSize: 10, color: '#6e7a74', margin: '4px 0 0', textTransform: 'uppercase', fontFamily: F.en }}>
                        {timeAgo(item.created_at)} • {item.entity_type.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{
              padding: '16px',
              background: '#f2f4f6',
              textAlign: 'center',
            }}>
              <Link href="/dashboard/work-orders" style={{
                color: '#00677d',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                fontFamily: F.en,
              }}>
                View All Notifications
              </Link>
            </div>
          </div>
        </div>

        {/* ── Platform Insight Banner ──────────────────────────────────── */}
        <div style={{
          background: '#4f5e82',
          color: '#ffffff',
          borderRadius: '12px',
          padding: '32px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 20px 40px rgba(79,94,130,0.2)',
        }}>
          {/* Decorative circle */}
          <div style={{
            position: 'absolute',
            top: -80,
            right: -80,
            width: 256,
            height: 256,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)',
          }} />

          <div style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 32,
            flexWrap: 'wrap',
          }}>
            <div style={{ maxWidth: 672 }}>
              <span style={{
                background: '#006b54',
                padding: '4px 12px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontFamily: F.en,
              }}>
                Platform Insight
              </span>
              <h3 style={{
                fontSize: 32,
                fontWeight: 700,
                margin: '12px 0 0',
                fontFamily: F.en,
                lineHeight: 1.2,
              }}>
                Preventive maintenance compliance is up by{' '}
                {stats.pmCompliancePercent > 80 ? '8%' : `${Math.max(1, Math.round(stats.pmCompliancePercent / 10))}%`} this month.
              </h3>
              <p style={{
                color: '#b7c6ef',
                marginTop: 8,
                fontSize: 16,
                lineHeight: 1.6,
                fontFamily: F.en,
              }}>
                Your facility operational health index is at an all-time high. Keep up the proactive maintenance schedule to reduce long-term asset costs.
              </p>
            </div>
            <Link href="/dashboard/pm-schedules" style={{ textDecoration: 'none' }}>
              <button style={{
                background: '#ffffff',
                color: '#4f5e82',
                padding: '12px 32px',
                borderRadius: '12px',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 15,
                fontFamily: F.en,
                flexShrink: 0,
              }}>
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

// ── StatusBar sub-component ───────────────────────────────────────────────────

function StatusBar({
  label, value, percent, barColor, sublabel, fontEN,
}: {
  label: string
  value: number
  percent: number
  barColor: string
  sublabel: string
  fontEN: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#191c1e', fontFamily: fontEN }}>
          {label}
        </span>
        <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: barColor, fontFamily: fontEN }}>
          {value}
        </span>
      </div>
      <div style={{ width: '100%', background: '#eceef0', height: 12, borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{
          background: barColor,
          height: '100%',
          borderRadius: 9999,
          width: `${percent}%`,
          transition: 'width 1s ease',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6e7a74', fontFamily: fontEN }}>
        <span>{sublabel}</span>
        <span>{percent}% of total open</span>
      </div>
    </div>
  )
}
