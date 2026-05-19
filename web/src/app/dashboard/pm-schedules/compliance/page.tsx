'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function PMCompliancePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSite, setFilterSite] = useState('all')
  const [filterTech, setFilterTech] = useState('all')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [technicians, setTechnicians] = useState<any[]>([])
  const supabase = createClient()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id
    const [{ data: sched }, { data: siteData }, { data: techData }] = await Promise.all([
      supabase.from('pm_schedules').select('*, asset:asset_id(name, category), site:site_id(name), assignee:assigned_to(full_name)').eq('organisation_id', orgId),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
    ])
    if (sched) setSchedules(sched)
    if (siteData) setSites(siteData)
    if (techData) setTechnicians(techData)
    setLoading(false)
  }

  const filtered = schedules.filter(s => {
    const matchSite = filterSite === 'all' || s.site_id === filterSite
    const matchTech = filterTech === 'all' || s.assigned_to === filterTech
    return matchSite && matchTech
  })

  const totalCompleted = filtered.reduce((sum, s) => sum + (s.completed_count || 0), 0)
  const totalOnTime = filtered.reduce((sum, s) => sum + (s.on_time_count || 0), 0)
  const overallCompliance = totalCompleted > 0 ? Math.round((totalOnTime / totalCompleted) * 100) : 0

  const complianceColor = (pct: number) =>
    pct >= 80 ? 'text-secondary' : pct >= 50 ? 'text-[#f57f17]' : 'text-error'

  const complianceBarColor = (pct: number) =>
    pct >= 80 ? 'bg-secondary' : pct >= 50 ? 'bg-[#f57f17]' : 'bg-error'

  if (loading) return <div className="p-8 text-on-surface-variant">Loading compliance data...</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-on-surface m-0">PM Compliance Dashboard</h1>
            <p className="text-sm text-on-surface-variant mt-1 mb-0">Track preventive maintenance completion rates</p>
          </div>
          <Link href='/dashboard/pm-schedules'>
            <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">Back to Schedules</button>
          </Link>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Schedules',    value: filtered.length,                          colorCls: 'text-on-surface' },
            { label: 'Active Schedules',   value: filtered.filter(s => s.is_active).length, colorCls: 'text-primary' },
            { label: 'Total Completed',    value: totalCompleted,                           colorCls: 'text-secondary' },
            { label: 'Overall Compliance', value: overallCompliance + '%',                  colorCls: complianceColor(overallCompliance) },
          ].map(card => (
            <div key={card.label} className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 relative overflow-hidden group shadow-sm">
              <p className="text-xs text-on-surface-variant mb-2 font-medium">{card.label}</p>
              <p className={`text-[28px] font-bold m-0 ${card.colorCls}`}>{card.value}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2.5 flex-wrap">
          <select value={filterSite} onChange={e => setFilterSite(e.target.value)} className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all w-auto">
            <option value='all'>All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterTech} onChange={e => setFilterTech(e.target.value)} className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all w-auto">
            <option value='all'>All Technicians</option>
            {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                {['Schedule','Asset','Site','Assigned To','Completed','On Time','Compliance'].map(h => (
                  <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const compliance = s.completed_count > 0 ? Math.round((s.on_time_count / s.completed_count) * 100) : null
                return (
                  <tr key={s.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-sm text-on-surface-variant border-b border-outline-variant">
                      <p className="text-sm font-medium text-on-surface m-0">{s.title}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5 mb-0">{s.frequency}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant border-b border-outline-variant">{s.asset?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant border-b border-outline-variant">{s.site?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant border-b border-outline-variant">{s.assignee?.full_name ?? 'Unassigned'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-on-surface border-b border-outline-variant">{s.completed_count || 0}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-primary border-b border-outline-variant">{s.on_time_count || 0}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant border-b border-outline-variant">
                      {compliance !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-outline-variant/30 rounded-full h-2 min-w-[60px]">
                            <div className={`${complianceBarColor(compliance)} rounded-full h-2`} style={{ width: compliance + '%' }} />
                          </div>
                          <span className={`text-sm font-semibold ${complianceColor(compliance)}`}>{compliance}%</span>
                        </div>
                      ) : <span className="text-sm text-on-surface-variant">No data yet</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
