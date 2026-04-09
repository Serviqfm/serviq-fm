'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isPast } from 'date-fns'
import Link from 'next/link'

export default function PMSchedulesPage() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => { fetchSchedules() }, [])

  async function fetchSchedules() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pm_schedules')
      .select('*, asset:asset_id(name), site:site_id(name), assignee:assigned_to(full_name)')
      .order('next_due_at', { ascending: true })
    if (!error && data) setSchedules(data)
    setLoading(false)
  }

  function calculateNextDue(frequency: string): string {
    const now = new Date()
    switch (frequency) {
      case 'daily':     now.setDate(now.getDate() + 1); break
      case 'weekly':    now.setDate(now.getDate() + 7); break
      case 'monthly':   now.setMonth(now.getMonth() + 1); break
      case 'quarterly': now.setMonth(now.getMonth() + 3); break
      case 'biannual':  now.setMonth(now.getMonth() + 6); break
      case 'annual':    now.setFullYear(now.getFullYear() + 1); break
      default:          now.setMonth(now.getMonth() + 1)
    }
    return now.toISOString()
  }

  async function generateWorkOrder(schedule: any) {
    setGenerating(schedule.id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGenerating(null); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setGenerating(null); return }
    const { error } = await supabase.from('work_orders').insert({
      title: schedule.title,
      description: schedule.description || null,
      priority: 'medium',
      status: schedule.assigned_to ? 'assigned' : 'new',
      source: 'pm_schedule',
      asset_id: schedule.asset_id || null,
      site_id: schedule.site_id || null,
      assigned_to: schedule.assigned_to || null,
      organisation_id: profile.organisation_id,
      created_by: user.id,
    })
    if (!error) {
      await supabase.from('pm_schedules').update({
        last_completed_at: new Date().toISOString(),
        last_generated_at: new Date().toISOString(),
        next_due_at: calculateNextDue(schedule.frequency),
      }).eq('id', schedule.id)
      fetchSchedules()
    }
    setGenerating(null)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('pm_schedules').update({ is_active: !current }).eq('id', id)
    fetchSchedules()
  }

  const freqLabel: Record<string, string> = {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
    quarterly: 'Quarterly', biannual: 'Every 6 Months', annual: 'Annual',
  }

  const isDue = (s: any) => s.next_due_at && isPast(new Date(s.next_due_at))
  const isDueSoon = (s: any) => {
    if (!s.next_due_at) return false
    const days = Math.ceil((new Date(s.next_due_at).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 7
  }

  const stats = {
    total: schedules.length,
    active: schedules.filter(s => s.is_active).length,
    due: schedules.filter(s => s.is_active && isDue(s)).length,
    soon: schedules.filter(s => s.is_active && isDueSoon(s) && !isDue(s)).length,
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Preventive Maintenance</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>
            {stats.total} schedules · {stats.active} active
            {stats.due > 0 && <span style={{ color: '#c62828' }}> · {stats.due} overdue</span>}
            {stats.soon > 0 && <span style={{ color: '#f57f17' }}> · {stats.soon} due this week</span>}
          </p>
        </div>
        <Link href='/dashboard/pm-schedules/new'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            + New PM Schedule
          </button>
        </Link>
      </div>

      {loading ? (
        <p style={{ color: '#999' }}>Loading...</p>
      ) : schedules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No PM schedules yet</p>
          <p style={{ fontSize: 14 }}>Create your first preventive maintenance schedule to get started</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                {['Schedule','Asset','Frequency','Assigned To','Next Due','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, i) => {
                const due = isDue(s)
                const soon = isDueSoon(s)
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', background: due && s.is_active ? '#fff8f8' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{s.title}</p>
                      {s.description && <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>{s.description.slice(0, 60)}{s.description.length > 60 ? '...' : ''}</p>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.asset?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#e8eaf6', color: '#283593', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                        {freqLabel[s.frequency] ?? s.frequency}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.assignee?.full_name ?? 'Unassigned'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>
                      {s.next_due_at ? (
                        <span style={{ color: due ? '#c62828' : soon ? '#f57f17' : '#666', fontWeight: due || soon ? 600 : 400 }}>
                          {format(new Date(s.next_due_at), 'dd MMM yyyy')}
                          {due && ' (Overdue)'}
                          {soon && !due && ' (Due soon)'}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: s.is_active ? '#e8f5e9' : '#f5f5f5', color: s.is_active ? '#2e7d32' : '#666', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                        {s.is_active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {s.is_active && (
                          <button onClick={() => generateWorkOrder(s)} disabled={generating === s.id} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #1a1a2e', background: 'white', color: '#1a1a2e', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                            {generating === s.id ? '...' : 'Generate WO'}
                          </button>
                        )}
                        <button onClick={() => toggleActive(s.id, s.is_active)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', color: '#666', cursor: 'pointer', fontSize: 12 }}>
                          {s.is_active ? 'Pause' : 'Resume'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}