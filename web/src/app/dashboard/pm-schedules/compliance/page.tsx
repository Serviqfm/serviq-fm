'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { C, F, pageStyle, cardStyle, secondaryBtn, inputStyle, tableHeaderCell, tableCell } from '@/lib/brand'

export default function PMCompliancePage() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterSite, setFilterSite] = useState('all')
  const [filterTech, setFilterTech] = useState('all')
  const [sites, setSites] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  const supabase = createClient()

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

  const complianceColor = (pct: number) => pct >= 80 ? C.teal : pct >= 50 ? C.warning : C.danger

  if (loading) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>Loading compliance data...</div>

  return (
    <div style={{ ...pageStyle, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>PM Compliance Dashboard</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>Track preventive maintenance completion rates</p>
        </div>
        <Link href='/dashboard/pm-schedules'>
          <button style={secondaryBtn}>Back to Schedules</button>
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Schedules',   value: filtered.length,                           color: C.navy },
          { label: 'Active Schedules',  value: filtered.filter(s => s.is_active).length,  color: C.success },
          { label: 'Total Completed',   value: totalCompleted,                            color: C.blue },
          { label: 'Overall Compliance',value: overallCompliance + '%',                   color: complianceColor(overallCompliance) },
        ].map(card => (
          <div key={card.label} style={cardStyle}>
            <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 8px', fontWeight: 500 }}>{card.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: card.color, fontFamily: F.en }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <select value={filterSite} onChange={e => setFilterSite(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value='all'>All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterTech} onChange={e => setFilterTech(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
          <option value='all'>All Technicians</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
      </div>

      <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
              {['Schedule','Asset','Site','Assigned To','Completed','On Time','Compliance'].map(h => (
                <th key={h} style={tableHeaderCell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const compliance = s.completed_count > 0 ? Math.round((s.on_time_count / s.completed_count) * 100) : null
              return (
                <tr key={s.id} style={{ background: C.white }}>
                  <td style={tableCell}>
                    <p style={{ fontSize: 14, fontWeight: 500, color: C.textDark, fontFamily: F.en, margin: 0 }}>{s.title}</p>
                    <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '2px 0 0' }}>{s.frequency}</p>
                  </td>
                  <td style={tableCell}>{s.asset?.name ?? '—'}</td>
                  <td style={tableCell}>{s.site?.name ?? '—'}</td>
                  <td style={tableCell}>{s.assignee?.full_name ?? 'Unassigned'}</td>
                  <td style={{ ...tableCell, fontSize: 14, fontWeight: 600, color: C.textDark }}>{s.completed_count || 0}</td>
                  <td style={{ ...tableCell, fontSize: 14, fontWeight: 600, color: C.success }}>{s.on_time_count || 0}</td>
                  <td style={tableCell}>
                    {compliance !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, background: C.border, borderRadius: 4, height: 8, minWidth: 60 }}>
                          <div style={{ background: complianceColor(compliance), borderRadius: 4, height: 8, width: compliance + '%' }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: complianceColor(compliance), fontFamily: F.en }}>{compliance}%</span>
                      </div>
                    ) : <span style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No data yet</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
