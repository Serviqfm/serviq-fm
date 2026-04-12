'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, getDay } from 'date-fns'
import Link from 'next/link'

export default function PMCalendarPage() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const supabase = createClient()

  useEffect(() => { fetchSchedules() }, [])

  async function fetchSchedules() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('pm_schedules').select('*, asset:asset_id(name), assignee:assigned_to(full_name)').eq('organisation_id', profile.organisation_id).eq('is_active', true).not('next_due_at', 'is', null)
    if (data) setSchedules(data)
    setLoading(false)
  }

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  const startPad = getDay(startOfMonth(currentMonth))
  const getSchedulesForDay = (day: Date) => schedules.filter(s => s.next_due_at && isSameDay(new Date(s.next_due_at), day))
  const monthSchedules = schedules.filter(s => {
    if (!s.next_due_at) return false
    const d = new Date(s.next_due_at)
    return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()
  }).sort((a, b) => new Date(a.next_due_at).getTime() - new Date(b.next_due_at).getTime())

  if (loading) return <div style={{ padding: '2rem' }}>Loading calendar...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>PM Calendar</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{monthSchedules.length} tasks scheduled this month</p>
        </div>
        <Link href='/dashboard/pm-schedules'>
          <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontSize: 13 }}>Back to Schedules</button>
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1.5rem' }}>
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 14 }}>Prev</button>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, minWidth: 200, textAlign: 'center' }}>{format(currentMonth, 'MMMM yyyy')}</h2>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 14 }}>Next</button>
        <button onClick={() => setCurrentMonth(new Date())} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13, color: '#666' }}>Today</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#eee', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', marginBottom: '2rem' }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ background: '#f9f9f9', padding: '8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#666' }}>{d}</div>
        ))}
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={'pad' + i} style={{ background: 'white', minHeight: 80 }} />
        ))}
        {days.map(day => {
          const ds = getSchedulesForDay(day)
          const today = isToday(day)
          return (
            <div key={day.toISOString()} style={{ background: 'white', minHeight: 80, padding: 6 }}>
              <div style={{ fontSize: 13, fontWeight: today ? 700 : 400, color: today ? 'white' : '#333', width: 24, height: 24, borderRadius: '50%', background: today ? '#1a1a2e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                {format(day, 'd')}
              </div>
              {ds.slice(0, 2).map(s => (
                <div key={s.id} style={{ fontSize: 10, background: '#e8eaf6', color: '#283593', borderRadius: 4, padding: '2px 4px', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title}
                </div>
              ))}
              {ds.length > 2 && <div style={{ fontSize: 10, color: '#999' }}>+{ds.length - 2} more</div>}
            </div>
          )
        })}
      </div>

      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: '1rem' }}>Tasks this month</h3>
        {monthSchedules.length === 0 ? (
          <p style={{ fontSize: 13, color: '#999' }}>No PM tasks scheduled for this month.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {monthSchedules.map(s => (
              <div key={s.id} style={{ background: 'white', border: '1px solid #eee', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{s.title}</p>
                  <p style={{ fontSize: 12, color: '#999', margin: '3px 0 0' }}>{s.asset?.name ?? 'No asset'} · {s.assignee?.full_name ?? 'Unassigned'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#283593' }}>{format(new Date(s.next_due_at), 'dd MMM yyyy')}</p>
                  <span style={{ fontSize: 11, background: '#e8eaf6', color: '#283593', padding: '1px 8px', borderRadius: 10 }}>{s.frequency}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}