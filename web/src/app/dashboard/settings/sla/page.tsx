// web/src/app/dashboard/settings/sla/page.tsx
// FM-03 / W5-2: admin/manager-managed SLA target matrix (its own page, by URL).
// One row per priority (low/medium/high/critical) holding response + resolution minutes.
// On WO create the API auto-fills sla_response_due_at + due_at from the matching row;
// first_response_at and the on-hold pause clock are managed by the WO create/patch routes.
// Writes go through the org-scoped Supabase client (RLS restricts to the caller's org AND
// admin/manager role); this page is additionally admin/manager-gated in the UI.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import type { Priority } from '@/types/work-order'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

const PRIORITIES: Priority[] = ['critical', 'high', 'medium', 'low']

function priorityLabel(p: Priority, lang: string): string {
  const en: Record<Priority, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }
  const ar: Record<Priority, string> = { critical: 'حرج', high: 'عالٍ', medium: 'متوسط', low: 'منخفض' }
  return (lang === 'ar' ? ar : en)[p]
}

// One editable row per priority; blank string = no target for that field.
type Draft = Record<Priority, { response: string; resolution: string }>
const emptyDraft = (): Draft => ({
  critical: { response: '', resolution: '' },
  high: { response: '', resolution: '' },
  medium: { response: '', resolution: '' },
  low: { response: '', resolution: '' },
})

function toMinutes(v: string): number | null {
  const n = parseInt(v, 10)
  return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

export default function SlaPoliciesPage() {
  const { lang } = useLanguage()
  const supabase = createClient()
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    setRole(profile.role ?? '')
    // Table may not exist yet (migration not applied) — treat any error as empty.
    const { data } = await supabase
      .from('sla_policies')
      .select('priority, response_minutes, resolution_minutes')
      .eq('organisation_id', profile.organisation_id)
    if (data) {
      const next = emptyDraft()
      for (const r of data as { priority: Priority; response_minutes: number | null; resolution_minutes: number | null }[]) {
        if (next[r.priority]) {
          next[r.priority] = {
            response: r.response_minutes == null ? '' : String(r.response_minutes),
            resolution: r.resolution_minutes == null ? '' : String(r.resolution_minutes),
          }
        }
      }
      setDraft(next)
    }
    setLoading(false)
  }

  async function save() {
    setError('')
    setSaving(true)
    // Upsert one row per priority on the (organisation_id, priority) unique key.
    const rows = PRIORITIES.map(p => ({
      organisation_id: orgId,
      priority: p,
      response_minutes: toMinutes(draft[p].response),
      resolution_minutes: toMinutes(draft[p].resolution),
    }))
    const { error: upErr } = await supabase
      .from('sla_policies')
      .upsert(rows, { onConflict: 'organisation_id,priority' })
    setSaving(false)
    if (upErr) { setError(upErr.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const isAdmin = role === 'admin' || role === 'manager'

  function setField(p: Priority, field: 'response' | 'resolution', v: string) {
    setDraft(d => ({ ...d, [p]: { ...d[p], [field]: v } }))
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {lang === 'ar' ? 'أهداف اتفاقية مستوى الخدمة' : 'SLA Targets'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {lang === 'ar'
          ? 'حدّد زمن الاستجابة والحل (بالدقائق) لكل أولوية. تُطبَّق تلقائياً على أوامر العمل الجديدة عندما لا يحدد المنشئ تاريخ استحقاق.'
          : 'Set response and resolution time (in minutes) per priority. Applied automatically to new work orders when the creator leaves the due date empty.'}
      </p>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        {loading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : !isAdmin ? (
          <p className="text-sm text-on-surface-variant">
            {lang === 'ar'
              ? 'هذه الإعدادات متاحة لمسؤولي ومديري المؤسسة فقط.'
              : 'These settings are available to organisation admins and managers only.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end mb-2">
              <span className={labelCls}>{lang === 'ar' ? 'الأولوية' : 'Priority'}</span>
              <span className={`${labelCls} w-32 text-center`}>{lang === 'ar' ? 'الاستجابة (دقائق)' : 'Response (min)'}</span>
              <span className={`${labelCls} w-32 text-center`}>{lang === 'ar' ? 'الحل (دقائق)' : 'Resolution (min)'}</span>
            </div>
            <div className="space-y-2">
              {PRIORITIES.map(p => (
                <div key={p} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                  <span className="text-sm font-medium text-on-surface">{priorityLabel(p, lang)}</span>
                  <input type="number" min={0} inputMode="numeric" className={`${inputCls} w-32`}
                    value={draft[p].response} onChange={e => setField(p, 'response', e.target.value)} placeholder="—" />
                  <input type="number" min={0} inputMode="numeric" className={`${inputCls} w-32`}
                    value={draft[p].resolution} onChange={e => setField(p, 'resolution', e.target.value)} placeholder="—" />
                </div>
              ))}
            </div>

            {error && (
              <div className="mt-4 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
            )}
            {saved && (
              <div className="mt-4 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-primary text-sm">
                {lang === 'ar' ? 'تم الحفظ بنجاح' : 'Saved successfully'}
              </div>
            )}
            <button onClick={save} disabled={saving}
              className="mt-5 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50">
              {saving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ الأهداف' : 'Save targets')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
