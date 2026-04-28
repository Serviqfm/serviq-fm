'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, pageStyle, cardStyle } from '@/lib/brand'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [woByStatus, setWoByStatus] = useState<any[]>([])
  const [woByPriority, setWoByPriority] = useState<any[]>([])
  const [assetsByCategory, setAssetsByCategory] = useState<any[]>([])
  const [kpis, setKpis] = useState({ totalWO: 0, openWO: 0, totalAssets: 0, totalPM: 0 })
  const supabase = createClient()
  const { lang } = useLanguage()

  useEffect(() => { fetchReports() }, [])

  async function fetchReports() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const orgId = profile.organisation_id

    const [{ data: wos }, { data: assets }, { data: pms }] = await Promise.all([
      supabase.from('work_orders').select('status, priority').eq('organisation_id', orgId),
      supabase.from('assets').select('category, status').eq('organisation_id', orgId),
      supabase.from('pm_schedules').select('is_active').eq('organisation_id', orgId),
    ])

    if (wos) {
      const statusMap: Record<string, number> = {}
      const priorityMap: Record<string, number> = {}
      for (const wo of wos) {
        statusMap[wo.status] = (statusMap[wo.status] ?? 0) + 1
        priorityMap[wo.priority] = (priorityMap[wo.priority] ?? 0) + 1
      }
      setWoByStatus(Object.entries(statusMap).map(([name, value]) => ({ name, value })))
      setWoByPriority(Object.entries(priorityMap).map(([name, value]) => ({ name, value })))
      setKpis(prev => ({ ...prev, totalWO: wos.length, openWO: wos.filter(w => !['completed', 'closed'].includes(w.status)).length }))
    }

    if (assets) {
      const catMap: Record<string, number> = {}
      for (const a of assets) {
        const cat = a.category ?? 'Other'
        catMap[cat] = (catMap[cat] ?? 0) + 1
      }
      setAssetsByCategory(Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value })))
      setKpis(prev => ({ ...prev, totalAssets: assets.length }))
    }

    if (pms) {
      setKpis(prev => ({ ...prev, totalPM: pms.filter(p => p.is_active).length }))
    }

    setLoading(false)
  }

  const STATUS_COLORS: Record<string, string> = {
    new:         C.blue,
    assigned:    C.mid,
    in_progress: C.warning,
    on_hold:     C.textLight,
    completed:   C.success,
    closed:      C.textMid,
  }

  const PRIORITY_COLORS: Record<string, string> = {
    low:      C.success,
    medium:   C.blue,
    high:     C.warning,
    critical: C.danger,
  }

  const CHART_COLORS = [C.navy, C.blue, C.mid, C.teal, C.warning, C.success, C.textMid, C.textLight]

  const statusLabel: Record<string, string> = {
    new:         lang === 'ar' ? 'جديد' : 'New',
    assigned:    lang === 'ar' ? 'مُسند' : 'Assigned',
    in_progress: lang === 'ar' ? 'قيد التنفيذ' : 'In Progress',
    on_hold:     lang === 'ar' ? 'معلق' : 'On Hold',
    completed:   lang === 'ar' ? 'مكتمل' : 'Completed',
    closed:      lang === 'ar' ? 'مغلق' : 'Closed',
  }

  const priorityLabel: Record<string, string> = {
    low:      lang === 'ar' ? 'منخفض' : 'Low',
    medium:   lang === 'ar' ? 'متوسط' : 'Medium',
    high:     lang === 'ar' ? 'عالي' : 'High',
    critical: lang === 'ar' ? 'حرج' : 'Critical',
  }

  if (loading) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>{lang === 'ar' ? 'جاري التحميل...' : 'Loading reports...'}</div>

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{lang === 'ar' ? 'التقارير' : 'Reports'}</h1>
        <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>{lang === 'ar' ? 'نظرة عامة على أداء العمليات' : 'Operational performance overview'}</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: lang === 'ar' ? 'إجمالي أوامر العمل' : 'Total Work Orders',   value: kpis.totalWO,    color: C.navy },
          { label: lang === 'ar' ? 'أوامر مفتوحة' : 'Open Work Orders',          value: kpis.openWO,     color: C.warning },
          { label: lang === 'ar' ? 'إجمالي الأصول' : 'Total Assets',              value: kpis.totalAssets, color: C.blue },
          { label: lang === 'ar' ? 'جداول صيانة نشطة' : 'Active PM Schedules',   value: kpis.totalPM,    color: C.success },
        ].map(card => (
          <div key={card.label} style={cardStyle}>
            <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 8px', fontWeight: 500 }}>{card.label}</p>
            <p style={{ fontSize: 32, fontWeight: 700, margin: 0, color: card.color, fontFamily: F.en }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Charts row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* WO by Status */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.textDark, fontFamily: F.en, margin: '0 0 1rem' }}>
            {lang === 'ar' ? 'أوامر العمل حسب الحالة' : 'Work Orders by Status'}
          </h3>
          {woByStatus.length === 0 ? (
            <p style={{ color: C.textLight, fontFamily: F.en, fontSize: 13 }}>{lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={woByStatus.map(d => ({ ...d, name: statusLabel[d.name] ?? d.name }))} barSize={28}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: F.en, fill: C.textMid }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fontFamily: F.en, fill: C.textMid }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontFamily: F.en, fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {woByStatus.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? C.blue} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* WO by Priority */}
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.textDark, fontFamily: F.en, margin: '0 0 1rem' }}>
            {lang === 'ar' ? 'أوامر العمل حسب الأولوية' : 'Work Orders by Priority'}
          </h3>
          {woByPriority.length === 0 ? (
            <p style={{ color: C.textLight, fontFamily: F.en, fontSize: 13 }}>{lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={woByPriority.map(d => ({ ...d, name: priorityLabel[d.name] ?? d.name }))}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {woByPriority.map((entry) => (
                    <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] ?? C.blue} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontFamily: F.en, fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
                <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontFamily: F.en, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Assets by Category */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.textDark, fontFamily: F.en, margin: '0 0 1rem' }}>
          {lang === 'ar' ? 'الأصول حسب الفئة' : 'Assets by Category'}
        </h3>
        {assetsByCategory.length === 0 ? (
          <p style={{ color: C.textLight, fontFamily: F.en, fontSize: 13 }}>{lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={assetsByCategory} layout="vertical" barSize={20}>
              <XAxis type="number" tick={{ fontSize: 11, fontFamily: F.en, fill: C.textMid }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fontFamily: F.en, fill: C.textMid }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontFamily: F.en, fontSize: 12, borderRadius: 8, border: `1px solid ${C.border}` }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {assetsByCategory.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
