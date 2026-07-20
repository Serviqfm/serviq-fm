'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WO = any
type Tech = { id: string; full_name: string }

// Board columns = the active WO lifecycle. Dragging a card into a column sets that status.
// 'completed' is the terminal column; 'closed' WOs are excluded from the board entirely.
const COLUMNS: { key: string; label: string; labelAr: string }[] = [
  { key: 'new', label: 'New', labelAr: 'جديد' },
  { key: 'assigned', label: 'Assigned', labelAr: 'مُسند' },
  { key: 'in_progress', label: 'In Progress', labelAr: 'قيد التنفيذ' },
  { key: 'on_hold', label: 'On Hold', labelAr: 'معلّق' },
  { key: 'completed', label: 'Completed', labelAr: 'مكتمل' },
]

const PRIORITY_CHIP: Record<string, string> = {
  critical: 'bg-[#fce4ec] text-[#C62828]',
  high: 'bg-[#fff3e0] text-[#E65100]',
  medium: 'bg-[#fff8e1] text-[#F57F17]',
  low: 'bg-[#e8f5e9] text-[#2E7D32]',
}

export default function WorkOrderBoardPage() {
  const supabase = createClient()
  const { lang } = useLanguage()
  const [wos, setWos] = useState<WO[]>([])
  const [techs, setTechs] = useState<Tech[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [isTech, setIsTech] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: me } = await supabase.from('users').select('id, role, organisation_id').eq('id', user.id).single()
    if (!me) { setLoading(false); return }
    setIsTech(me.role === 'technician')

    let query = supabase
      .from('work_orders')
      .select('id, wo_number, title, status, priority, due_at, assigned_to, asset:asset_id(name), site:site_id(name), assignee:assigned_to(full_name)')
      .eq('organisation_id', me.organisation_id)
      .not('status', 'eq', 'closed')
      .is('archived_at', null) // WO-12: hide archived WOs
    // CORE-21: technicians see only their own WOs, same filter as the list/calendar.
    if (me.role === 'technician') query = query.or(`assigned_to.eq.${me.id},additional_workers.cs.{${me.id}}`)
    const { data } = await query
    if (data) setWos(data)

    // Managers/admins can reassign from the board; technicians cannot.
    if (me.role !== 'technician') {
      const { data: t } = await supabase.from('users').select('id, full_name')
        .eq('organisation_id', me.organisation_id).in('role', ['technician', 'manager'])
      if (t) setTechs(t)
    }
    setLoading(false)
  }

  async function persist(woId: string, patch: Record<string, unknown>, auditAction: string, oldVals: Record<string, unknown>) {
    setSavingId(woId)
    setWos(prev => prev.map(w => w.id === woId ? { ...w, ...patch } : w))
    const { error } = await supabase.from('work_orders')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', woId)
    if (error) {
      await load() // revert to server truth
    } else {
      // Best-effort audit, matching the calendar/close convention — never wedge the UI on a failed log.
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const { data: profile } = user ? await supabase.from('users').select('organisation_id').eq('id', user.id).single() : { data: null }
        if (profile && user) {
          await supabase.from('audit_logs').insert({
            entity_type: 'work_order', entity_id: woId, action: auditAction,
            user_id: user.id, organisation_id: profile.organisation_id,
            old_values: oldVals, new_values: patch,
          })
        }
      } catch (auditErr) {
        console.error('[wo-board] audit log failed', auditErr)
      }
    }
    setSavingId(null)
  }

  function advance(woId: string, status: string) {
    const wo = wos.find(w => w.id === woId)
    if (!wo || wo.status === status) return
    persist(woId, { status }, `Status → ${status}`, { status: wo.status })
  }

  function reassign(wo: WO, techId: string) {
    if (techId === (wo.assigned_to ?? '')) return
    const tech = techs.find(t => t.id === techId)
    // Assigning bumps a 'new' WO to 'assigned', mirroring the list bulk-assign shape.
    const patch: Record<string, unknown> = { assigned_to: techId || null }
    if (techId && wo.status === 'new') patch.status = 'assigned'
    persist(wo.id, patch, techId ? `Assigned to ${tech?.full_name ?? techId}` : 'Unassigned', { assigned_to: wo.assigned_to ?? null, status: wo.status })
  }

  const overdue = (wo: WO) => wo.due_at && !['completed', 'closed'].includes(wo.status) && new Date(wo.due_at) < new Date()

  if (loading) return <div className="p-8 text-on-surface-variant">{lang === 'ar' ? 'جارٍ التحميل…' : 'Loading board…'}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-on-surface">{lang === 'ar' ? 'لوحة التوزيع' : 'Dispatch Board'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {wos.length} {lang === 'ar' ? 'أمر عمل نشط · اسحب بطاقة لتغيير الحالة' : 'active · drag a card to change status'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/work-orders/calendar">
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">calendar_month</span>{lang === 'ar' ? 'التقويم' : 'Calendar'}
              </button>
            </Link>
            <Link href="/dashboard/work-orders">
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">list</span>{lang === 'ar' ? 'عرض القائمة' : 'List view'}
              </button>
            </Link>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => {
            const cards = wos.filter(w => w.status === col.key)
            return (
              <div key={col.key}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const wid = e.dataTransfer.getData('text/plain'); if (wid) advance(wid, col.key) }}
                className="flex-shrink-0 w-[280px] bg-surface-container-low rounded-xl border border-outline-variant/30 flex flex-col">
                <div className="px-3 py-2.5 border-b border-outline-variant/30 flex items-center justify-between">
                  <span className="text-sm font-bold text-on-surface">{lang === 'ar' ? col.labelAr : col.label}</span>
                  <span className="text-xs text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">{cards.length}</span>
                </div>
                <div className="p-2 flex flex-col gap-2 min-h-[120px]">
                  {cards.map(w => (
                    <div key={w.id} draggable
                      onDragStart={e => e.dataTransfer.setData('text/plain', w.id)}
                      className={`bg-surface-container-lowest rounded-lg border border-outline-variant/40 p-2.5 cursor-grab active:cursor-grabbing ${savingId === w.id ? 'opacity-50' : ''}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <Link href={`/dashboard/work-orders/${w.id}`} className="text-xs font-semibold text-primary no-underline hover:underline">
                          {w.wo_number ? `WO-${String(w.wo_number).padStart(4, '0')}` : w.id.slice(0, 6)}
                        </Link>
                        {w.priority && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PRIORITY_CHIP[w.priority] ?? 'bg-surface-container text-on-surface-variant'}`}>{w.priority}</span>}
                      </div>
                      <div className="text-xs text-on-surface mb-1.5 line-clamp-2">{w.title}</div>
                      {(w.asset?.name || w.site?.name) && (
                        <div className="text-[10px] text-on-surface-variant truncate mb-1">{w.asset?.name ?? w.site?.name}</div>
                      )}
                      {w.due_at && (
                        <div className={`text-[10px] mb-1.5 ${overdue(w) ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>
                          {overdue(w) ? (lang === 'ar' ? 'متأخر · ' : 'Overdue · ') : ''}{format(new Date(w.due_at), 'dd MMM')}
                        </div>
                      )}
                      {isTech ? (
                        <div className="text-[10px] text-on-surface-variant truncate">{w.assignee?.full_name ?? (lang === 'ar' ? 'غير مُسند' : 'Unassigned')}</div>
                      ) : (
                        <select value={w.assigned_to ?? ''} onChange={e => reassign(w, e.target.value)}
                          className="w-full text-[11px] border border-outline-variant/40 rounded-md px-1.5 py-1 bg-surface-container-lowest text-on-surface-variant cursor-pointer">
                          <option value="">{lang === 'ar' ? 'غير مُسند' : 'Unassigned'}</option>
                          {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
