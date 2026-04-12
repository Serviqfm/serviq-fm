'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

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
  const complianceColor = (pct: number) => pct >= 80 ? '#2e7d32' : pct >= 50 ? '#f57f17' : '#c62828'
  const selectStyle = { padding: '7px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer' }

  if (loading) return <div style={{ padding: '2rem' }}>Loading compliance data...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>PM Compliance Dashboard</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>Track preventive maintenance completion rates</p>
        </div>
        <Link href='/dashboard/pm-schedules'>
          <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontSize: 13 }}>Back to Schedules</button>
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Schedules', value: filtered.length, color: '#1a1a2e' },
          { label: 'Active Schedules', value: filtered.filter(s => s.is_active).length, color: '#2e7d32' },
          { label: 'Total Completed', value: totalCompleted, color: '#283593' },
          { label: 'Overall Compliance', value: overallCompliance + '%', color: complianceColor(overallCompliance) },
        ].map(card => (
          <div key={card.label} style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1rem' }}>
            <p style={{ fontSize: 12, color: '#999', margin: '0 0 8px', fontWeight: 500 }}>{card.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: card.color }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <select value={filterSite} onChange={e => setFilterSite(e.target.value)} style={selectStyle}>
          <option value='all'>All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterTech} onChange={e => setFilterTech(e.target.value)} style={selectStyle}>
          <option value='all'>All Technicians</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              {['Schedule','Asset','Site','Assigned To','Completed','On Time','Compliance'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => {
              const compliance = s.completed_count > 0 ? Math.round((s.on_time_count / s.completed_count) * 100) : null
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{s.title}</p>
                    <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>{s.frequency}</p>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.asset?.name ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.site?.name ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.assignee?.full_name ?? 'Unassigned'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>{s.completed_count || 0}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#2e7d32' }}>{s.on_time_count || 0}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {compliance !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 4, height: 8, minWidth: 60 }}>
                          <div style={{ background: complianceColor(compliance), borderRadius: 4, height: 8, width: compliance + '%' }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: complianceColor(compliance) }}>{compliance}%</span>
                      </div>
                    ) : <span style={{ fontSize: 13, color: '#bbb' }}>No data yet</span>}
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