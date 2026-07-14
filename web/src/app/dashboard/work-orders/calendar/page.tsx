'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, getDay } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WO = any

const STATUS_CHIP: Record<string, string> = {
  new: 'bg-[#e3f2fd] text-[#1A7FC1]',
  assigned: 'bg-[#e8eaf6] text-[#1E2D4E]',
  in_progress: 'bg-[#fff8e1] text-[#F57F17]',
  on_hold: 'bg-[#fce4ec] text-[#C62828]',
}

export default function WorkOrderCalendarPage() {
  const supabase = createClient()
  const { lang } = useLanguage()
  const [wos, setWos] = useState<WO[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [savingId, setSavingId] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchWOs() }, [])

  async function fetchWOs() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: me } = await supabase.from('users').select('id, role, organisation_id').eq('id', user.id).single()
    if (!me) { setLoading(false); return }
    let query = supabase
      .from('work_orders')
      .select('id, wo_number, title, status, priority, due_at, asset:asset_id(name), site:site_id(name), assignee:assigned_to(full_name)')
      .eq('organisation_id', me.organisation_id)
      .not('due_at', 'is', null)
      .not('status', 'in', '("completed","closed")')
    // CORE-21: technicians only see their own WOs on the calendar too.
    if (me.role === 'technician') query = query.or(`assigned_to.eq.${me.id},additional_workers.cs.{${me.id}}`)
    const { data } = await query
    if (data) setWos(data)
    setLoading(false)
  }

  async function reschedule(woId: string, day: Date) {
    const wo = wos.find(w => w.id === woId)
    if (!wo || !wo.due_at) return
    const orig = new Date(wo.due_at)
    if (isSameDay(orig, day)) return
    const nd = new Date(day)
    nd.setHours(orig.getHours(), orig.getMinutes(), 0, 0)
    setSavingId(woId)
    // Optimistic update
    setWos(prev => prev.map(w => w.id === woId ? { ...w, due_at: nd.toISOString() } : w))
    const { error } = await supabase.from('work_orders').update({ due_at: nd.toISOString(), updated_at: new Date().toISOString() }).eq('id', woId)
    if (error) {
      await fetchWOs() // revert to server truth
    } else {
      // Best-effort audit (matches the close/reopen route convention) — a failed
      // audit write must never wedge the UI; the reschedule itself already saved.
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: profile } = user ? await supabase.from('users').select('organisation_id').eq('id', user.id).single() : { data: null }
        if (profile && user) {
          await supabase.from('audit_logs').insert({
            entity_type: 'work_order', entity_id: woId,
            action: `Rescheduled to ${format(nd, 'dd MMM yyyy')}`,
            user_id: user.id, organisation_id: profile.organisation_id,
            old_values: { due_at: orig.toISOString() }, new_values: { due_at: nd.toISOString() },
          })
        }
      } catch (auditErr) {
        console.error('[wo-calendar] audit log failed', auditErr)
      }
    }
    setSavingId(null)
  }

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  const startPad = getDay(startOfMonth(currentMonth))
  const forDay = (day: Date) => wos.filter(w => w.due_at && isSameDay(new Date(w.due_at), day))
  const monthCount = wos.filter(w => {
    const d = new Date(w.due_at)
    return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()
  }).length

  if (loading) return <div className="p-8 text-on-surface-variant">Loading calendar…</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{lang === 'ar' ? 'تقويم أوامر العمل' : 'Work Order Calendar'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{monthCount} {lang === 'ar' ? 'أمر عمل مستحق هذا الشهر · اسحب لإعادة الجدولة' : 'due this month · drag a card to reschedule'}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/work-orders/board">
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">view_kanban</span>{lang === 'ar' ? 'لوحة التوزيع' : 'Board'}
              </button>
            </Link>
            <Link href="/dashboard/work-orders">
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">list</span>{lang === 'ar' ? 'عرض القائمة' : 'List view'}
              </button>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low transition-colors text-sm">‹</button>
          <h2 className="text-lg font-bold text-on-surface min-w-[180px] text-center">{format(currentMonth, 'MMMM yyyy')}</h2>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low transition-colors text-sm">›</button>
          <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low transition-colors text-xs">{lang === 'ar' ? 'اليوم' : 'Today'}</button>
        </div>

        <div className="grid grid-cols-7 gap-px bg-outline-variant/30 border border-outline-variant/30 rounded-xl overflow-hidden">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="bg-surface-container px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{d}</div>
          ))}
          {Array.from({ length: startPad }).map((_, i) => <div key={'pad' + i} className="bg-surface-container-lowest min-h-[96px]" />)}
          {days.map(day => {
            const ds = forDay(day)
            const today = isToday(day)
            return (
              <div key={day.toISOString()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const wid = e.dataTransfer.getData('text/plain'); if (wid) reschedule(wid, day) }}
                className="bg-surface-container-lowest min-h-[96px] p-1.5 align-top">
                <div className={`text-xs w-6 h-6 rounded-full flex items-center justify-center mb-1 ${today ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant'}`}>{format(day, 'd')}</div>
                {ds.slice(0, 3).map(w => (
                  <Link key={w.id} href={`/dashboard/work-orders/${w.id}`} className="block no-underline">
                    <div draggable
                      onDragStart={e => e.dataTransfer.setData('text/plain', w.id)}
                      className={`text-[10px] rounded px-1.5 py-1 mb-1 truncate cursor-grab active:cursor-grabbing ${STATUS_CHIP[w.status] ?? 'bg-surface-container text-on-surface-variant'} ${savingId === w.id ? 'opacity-50' : ''}`}
                      title={`${w.wo_number ? `WO-${String(w.wo_number).padStart(4, '0')} · ` : ''}${w.title}`}>
                      {w.wo_number ? `WO-${String(w.wo_number).padStart(4, '0')} ` : ''}{w.title}
                    </div>
                  </Link>
                ))}
                {ds.length > 3 && <div className="text-[10px] text-on-surface-variant px-1">+{ds.length - 3} {lang === 'ar' ? 'المزيد' : 'more'}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
