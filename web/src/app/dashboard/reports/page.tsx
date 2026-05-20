'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, Legend,
} from 'recharts'

const STATUS_COLORS: Record<string, string> = {
  new:         '#4f5e82',
  assigned:    '#006b54',
  in_progress: '#00677d',
  on_hold:     '#bdc9c3',
  completed:   '#76d8b9',
  closed:      '#3e4944',
}

const PRIORITY_COLORS: Record<string, string> = {
  low:      '#006b54',
  medium:   '#f57f17',
  high:     '#e65100',
  critical: '#ba1a1a',
}

const CHART_COLORS = ['#006b54', '#00677d', '#4f5e82', '#76d8b9', '#68d4f3', '#f57f17', '#ba1a1a', '#bdc9c3']

const TOOLTIP_STYLE = { fontFamily: 'DM Sans, sans-serif', fontSize: 12, borderRadius: 8, border: '1px solid #bdc9c3' }
const TICK_STYLE = { fontSize: 11, fontFamily: 'DM Sans, sans-serif', fill: '#3e4944' }

const STANDARD_REPORTS = [
  { icon: 'monitoring',    title: 'Monthly Asset Health',      desc: 'Detailed breakdown of equipment lifecycle, downtime patterns, and predicted failures.', tags: ['Asset Management', 'Monthly'],  iconCls: 'bg-primary/10 text-primary' },
  { icon: 'engineering',   title: 'Technician Performance',    desc: 'Efficiency metrics, job completion rates, and feedback scores by technician.',          tags: ['HR & Operations', 'Weekly'],    iconCls: 'bg-secondary/10 text-secondary' },
  { icon: 'checklist_rtl', title: 'PM Compliance',             desc: 'Audit of preventive maintenance tasks vs scheduled dates for warranty compliance.',      tags: ['Compliance', 'Critical'],       iconCls: 'bg-tertiary/10 text-tertiary' },
]

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [woByStatus, setWoByStatus] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [woByPriority, setWoByPriority] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assetsByCategory, setAssetsByCategory] = useState<any[]>([])
  const [kpis, setKpis] = useState({ totalWO: 0, openWO: 0, totalAssets: 0, totalPM: 0 })
  const supabase = createClient()
  const { lang } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
    if (rows.length === 0) { alert('No data to export.'); return }
    const cols = Object.keys(rows[0])
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return ''
      const s = typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v))
      return `"${s.replace(/"/g, '""')}"`
    }
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function getOrgId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    return profile?.organisation_id ?? null
  }

  async function quickExport() {
    const orgId = await getOrgId()
    if (!orgId) { alert('Not signed in.'); return }
    const today = new Date().toISOString().slice(0, 10)
    downloadCSV(`reports-summary-${today}.csv`, [
      { metric: 'Total Work Orders', value: kpis.totalWO },
      { metric: 'Open Work Orders', value: kpis.openWO },
      { metric: 'Total Assets', value: kpis.totalAssets },
      { metric: 'Active PM Schedules', value: kpis.totalPM },
      ...woByStatus.map((s: { name: string; value: number }) => ({ metric: 'WO Status: ' + s.name, value: s.value })),
      ...woByPriority.map((s: { name: string; value: number }) => ({ metric: 'WO Priority: ' + s.name, value: s.value })),
      ...assetsByCategory.map((s: { name: string; value: number }) => ({ metric: 'Assets by category: ' + s.name, value: s.value })),
    ])
  }

  async function buildCustomReport() {
    const orgId = await getOrgId()
    if (!orgId) { alert('Not signed in.'); return }
    const { data } = await supabase
      .from('work_orders')
      .select('wo_number, title, status, priority, created_at, completed_at, asset:asset_id(name), site:site_id(name)')
      .eq('organisation_id', orgId)
      .order('created_at', { ascending: false })
    const rows = (data ?? []) as unknown as { wo_number?: string; title?: string; status?: string; priority?: string; created_at?: string; completed_at?: string; asset?: { name?: string } | null; site?: { name?: string } | null }[]
    const flat = rows.map(w => ({
      wo_number: w.wo_number ?? '',
      title: w.title ?? '',
      status: w.status ?? '',
      priority: w.priority ?? '',
      created_at: w.created_at ?? '',
      completed_at: w.completed_at ?? '',
      asset: w.asset?.name ?? '',
      site: w.site?.name ?? '',
    }))
    downloadCSV(`work-orders-${new Date().toISOString().slice(0, 10)}.csv`, flat)
  }

  async function generateStandardReport(title: string) {
    const orgId = await getOrgId()
    if (!orgId) { alert('Not signed in.'); return }
    if (title === 'Monthly Asset Health') {
      const { data } = await supabase.from('assets').select('name, category, status, criticality, purchase_date, last_pm_at').eq('organisation_id', orgId)
      downloadCSV(`asset-health-${new Date().toISOString().slice(0, 10)}.csv`, data ?? [])
    } else if (title === 'Technician Performance') {
      const { data } = await supabase.from('work_orders').select('assigned_to, status, priority, created_at, completed_at').eq('organisation_id', orgId)
      downloadCSV(`technician-performance-${new Date().toISOString().slice(0, 10)}.csv`, data ?? [])
    } else if (title === 'PM Compliance') {
      const { data } = await supabase.from('pm_schedules').select('name, frequency, next_due_at, last_completed_at, is_active').eq('organisation_id', orgId)
      downloadCSV(`pm-compliance-${new Date().toISOString().slice(0, 10)}.csv`, data ?? [])
    }
  }

  const statusLabel: Record<string, string> = {
    new:         lang === 'ar' ? 'جديد'      : 'New',
    assigned:    lang === 'ar' ? 'مُسند'     : 'Assigned',
    in_progress: lang === 'ar' ? 'قيد التنفيذ' : 'In Progress',
    on_hold:     lang === 'ar' ? 'معلق'      : 'On Hold',
    completed:   lang === 'ar' ? 'مكتمل'     : 'Completed',
    closed:      lang === 'ar' ? 'مغلق'      : 'Closed',
  }

  const priorityLabel: Record<string, string> = {
    low:      lang === 'ar' ? 'منخفض' : 'Low',
    medium:   lang === 'ar' ? 'متوسط' : 'Medium',
    high:     lang === 'ar' ? 'عالي'  : 'High',
    critical: lang === 'ar' ? 'حرج'   : 'Critical',
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{lang === 'ar' ? 'جاري التحميل...' : 'Loading reports...'}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{lang === 'ar' ? 'التقارير والتحليلات' : 'Reports & Analytics'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{lang === 'ar' ? 'نظرة عامة على أداء العمليات' : 'Deep dive into operational efficiency and asset longevity.'}</p>
          </div>
          <button onClick={quickExport} className="bg-secondary text-on-secondary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-secondary/90 transition-colors shadow-sm self-start sm:self-auto">
            <span className="material-symbols-outlined text-lg">cloud_download</span>
            Quick Export
          </button>
        </div>

        {/* KPI bento row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: lang === 'ar' ? 'إجمالي أوامر العمل' : 'Total Work Orders',  value: kpis.totalWO,    icon: 'assignment',    color: 'text-primary',    decor: 'bg-primary/5'   },
            { label: lang === 'ar' ? 'أوامر مفتوحة'        : 'Open Work Orders',   value: kpis.openWO,     icon: 'pending_actions', color: 'text-[#f57f17]', decor: 'bg-[#f57f17]/5' },
            { label: lang === 'ar' ? 'إجمالي الأصول'        : 'Total Assets',       value: kpis.totalAssets, icon: 'inventory_2',   color: 'text-secondary',  decor: 'bg-secondary/5' },
          ].map(c => (
            <div key={c.label} className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 relative overflow-hidden group shadow-sm">
              <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-[64px] leading-none ${c.decor}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 64 }}>{c.icon}</span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">{c.label}</p>
              <p className={`text-5xl font-bold ${c.color}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* System health gradient card + PM stat */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-gradient-to-br from-primary to-secondary rounded-xl p-6 text-on-primary flex flex-col justify-between shadow-lg min-h-[120px]">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold uppercase tracking-wider text-on-primary/80">System Health</span>
              <span className="material-symbols-outlined">analytics</span>
            </div>
            <div>
              <div className="h-2 w-full bg-on-primary/20 rounded-full mb-2 overflow-hidden">
                <div className="h-full bg-on-primary rounded-full" style={{ width: `${kpis.totalPM > 0 ? Math.min(95, 80 + kpis.totalPM) : 80}%` }} />
              </div>
              <p className="font-bold text-sm">{kpis.totalPM} active PM schedules keeping assets healthy</p>
            </div>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 relative overflow-hidden group shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 64 }}>event_repeat</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">{lang === 'ar' ? 'جداول صيانة نشطة' : 'Active PM Schedules'}</p>
            <p className="text-5xl font-bold text-primary">{kpis.totalPM}</p>
          </div>
        </div>

        {/* Main 2-col layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Left: Report Builder */}
          <div className="lg:col-span-4">
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 shadow-sm sticky top-24 space-y-5">
              <h2 className="text-xl font-bold text-on-surface">Report Builder</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-primary block mb-1.5">Date Range</label>
                  <select className="w-full bg-surface-container-low border-2 border-transparent focus:border-secondary transition-all rounded-xl px-4 py-3 text-sm outline-none">
                    <option>Last 30 Days</option>
                    <option>Current Quarter</option>
                    <option>Fiscal Year 2024</option>
                    <option>Custom Range</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-primary block mb-1.5">Category</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Assets', 'HVAC', 'Plumbing', 'Security'].map(cat => (
                      <label key={cat} className="flex items-center gap-2 p-2 border border-outline-variant/30 rounded-lg cursor-pointer hover:bg-primary/5 transition-colors">
                        <input type="checkbox" defaultChecked={cat === 'Assets' || cat === 'Plumbing'} className="rounded text-primary" />
                        <span className="text-sm">{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="pt-2">
                  <button onClick={buildCustomReport} className="w-full py-3 bg-secondary text-on-secondary font-bold rounded-xl shadow-sm hover:bg-secondary/90 transition-colors">
                    Build Custom Report
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Charts + Standard Reports */}
          <div className="lg:col-span-8 space-y-6">

            {/* WO charts row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-on-surface mb-4">{lang === 'ar' ? 'أوامر العمل حسب الحالة' : 'Work Orders by Status'}</h3>
                {woByStatus.length === 0 ? (
                  <p className="text-on-surface-variant text-sm">{lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={woByStatus.map(d => ({ ...d, name: statusLabel[d.name] ?? d.name }))} barSize={24}>
                      <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                      <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {woByStatus.map(entry => <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#006b54'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-on-surface mb-4">{lang === 'ar' ? 'أوامر العمل حسب الأولوية' : 'Work Orders by Priority'}</h3>
                {woByPriority.length === 0 ? (
                  <p className="text-on-surface-variant text-sm">{lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={woByPriority.map(d => ({ ...d, name: priorityLabel[d.name] ?? d.name }))}
                        dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={35}>
                        {woByPriority.map(entry => <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] ?? '#006b54'} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Assets by category */}
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-on-surface mb-4">{lang === 'ar' ? 'الأصول حسب الفئة' : 'Assets by Category'}</h3>
              {assetsByCategory.length === 0 ? (
                <p className="text-on-surface-variant text-sm">{lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={assetsByCategory} layout="vertical" barSize={16}>
                    <XAxis type="number" tick={TICK_STYLE} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" width={130} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {assetsByCategory.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Standard Reports */}
            <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl overflow-hidden shadow-sm">
              <div className="p-5 border-b border-outline-variant/20 bg-surface-container-low/30 flex justify-between items-center">
                <h3 className="text-base font-bold text-on-surface">Standard Reports</h3>
              </div>
              <div className="divide-y divide-outline-variant/10">
                {STANDARD_REPORTS.map(r => (
                  <div key={r.title} className="p-5 hover:bg-surface-container-low/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${r.iconCls}`}>
                        <span className="material-symbols-outlined text-2xl">{r.icon}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-on-surface text-sm">{r.title}</h4>
                        <p className="text-on-surface-variant text-xs mt-0.5 max-w-md">{r.desc}</p>
                        <div className="flex gap-2 mt-2">
                          {r.tags.map(tag => (
                            <span key={tag} className="bg-primary/10 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end md:self-center flex-shrink-0">
                      <button onClick={() => alert('Scheduled reports are coming soon.')} className="px-3 py-1.5 bg-surface-container-high text-on-surface-variant rounded-lg font-semibold text-xs hover:bg-surface-container-highest transition-colors flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">calendar_today</span> Schedule
                      </button>
                      <button onClick={() => generateStandardReport(r.title)} className="px-3 py-1.5 bg-primary text-on-primary rounded-lg font-semibold text-xs hover:bg-primary/90 transition-colors flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">download</span> Generate
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
