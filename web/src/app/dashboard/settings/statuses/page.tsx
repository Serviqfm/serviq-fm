// web/src/app/dashboard/settings/statuses/page.tsx
// B5 / WO-25: admin/manager-managed custom work-order statuses (its own page, by URL).
// A custom status is a DISPLAY sub-state that maps to one of the 6 BASE statuses; the
// WO detail status control writes work_orders.status = maps_to_base_status alongside
// custom_status_id, so the CORE-20 lifecycle trigger always sees a legal base value.
// Writes go through the org-scoped Supabase client (RLS restricts to the caller's org
// AND admin/manager role); this page is additionally admin/manager-gated in the UI.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import type { WorkOrderStatus } from '@/types/work-order'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

const BASE_STATUSES: WorkOrderStatus[] = ['new', 'assigned', 'in_progress', 'on_hold', 'completed', 'closed']

function baseLabel(s: string, lang: string): string {
  const en: Record<string, string> = { new: 'New', assigned: 'Assigned', in_progress: 'In Progress', on_hold: 'On Hold', completed: 'Completed', closed: 'Closed' }
  const ar: Record<string, string> = { new: 'جديد', assigned: 'مُعيَّن', in_progress: 'قيد التنفيذ', on_hold: 'مُعلَّق', completed: 'مكتمل', closed: 'مغلق' }
  return (lang === 'ar' ? ar : en)[s] ?? s
}

type CustomStatus = {
  id: string
  name: string
  name_ar: string | null
  color: string | null
  maps_to_base_status: WorkOrderStatus
  sort_order: number
  is_active: boolean
}

const emptyDraft = { name: '', name_ar: '', color: '#6b7280', maps_to_base_status: 'on_hold' as WorkOrderStatus }

export default function CustomStatusesPage() {
  const { lang } = useLanguage()
  const supabase = createClient()
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState('')
  const [rows, setRows] = useState<CustomStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

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
      .from('work_order_custom_statuses')
      .select('*')
      .eq('organisation_id', profile.organisation_id)
      .order('sort_order')
    if (data) setRows(data as CustomStatus[])
    setLoading(false)
  }

  async function add() {
    setError('')
    const name = draft.name.trim()
    if (!name) { setError(lang === 'ar' ? 'الاسم مطلوب' : 'Name is required'); return }
    if (rows.some(r => r.name.toLowerCase() === name.toLowerCase())) {
      setError(lang === 'ar' ? 'حالة بنفس الاسم موجودة' : 'A status with this name already exists'); return
    }
    setSaving(true)
    const { error: insErr } = await supabase.from('work_order_custom_statuses').insert({
      organisation_id: orgId,
      name,
      name_ar: draft.name_ar.trim() || null,
      color: draft.color || null,
      maps_to_base_status: draft.maps_to_base_status,
      sort_order: rows.length,
    })
    setSaving(false)
    if (insErr) { setError(insErr.message); return }
    setDraft(emptyDraft)
    load()
  }

  async function remove(id: string) {
    if (!confirm(lang === 'ar'
      ? 'حذف هذه الحالة؟ تعود أوامر العمل إلى حالتها الأساسية.'
      : 'Delete this status? Affected work orders revert to their base status.')) return
    await supabase.from('work_order_custom_statuses').delete().eq('id', id)
    load()
  }

  async function toggleActive(row: CustomStatus) {
    await supabase.from('work_order_custom_statuses').update({ is_active: !row.is_active }).eq('id', row.id)
    load()
  }

  const isAdmin = role === 'admin' || role === 'manager'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {lang === 'ar' ? 'حالات أوامر العمل المخصّصة' : 'Custom Work Order Statuses'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {lang === 'ar'
          ? 'حالات عرض إضافية (مثل "مُعلَّق – بانتظار قطع الغيار") تُطابَق مع إحدى الحالات الأساسية الست للحفاظ على دورة الحياة والتقارير.'
          : 'Extra display statuses (e.g. “On Hold – Waiting for Parts”) that map to one of the six base statuses so lifecycle and reporting stay consistent.'}
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
            {rows.length === 0 ? (
              <p className="text-sm text-on-surface-variant mb-4">
                {lang === 'ar'
                  ? 'لا توجد حالات مخصّصة بعد.'
                  : 'No custom statuses yet.'}
              </p>
            ) : (
              <div className="space-y-2 mb-4">
                {rows.map(row => (
                  <div key={row.id} className="flex items-center justify-between gap-4 py-2 border-b border-outline-variant/40 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: row.color ?? '#6b7280' }} />
                      <div className="min-w-0">
                        <div className="text-sm text-on-surface font-medium truncate">
                          {lang === 'ar' && row.name_ar ? row.name_ar : row.name}
                          {!row.is_active && <span className="ml-2 text-[11px] text-on-surface-variant">({lang === 'ar' ? 'غير نشط' : 'inactive'})</span>}
                        </div>
                        <div className="text-[11px] text-on-surface-variant">
                          {lang === 'ar' ? 'يُطابَق مع: ' : 'Maps to: '}{baseLabel(row.maps_to_base_status, lang)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => toggleActive(row)}
                        className="px-3 py-1 rounded-full text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container-low transition-colors">
                        {row.is_active ? (lang === 'ar' ? 'تعطيل' : 'Disable') : (lang === 'ar' ? 'تفعيل' : 'Enable')}
                      </button>
                      <button onClick={() => remove(row.id)}
                        className="px-3 py-1 rounded-full text-xs text-error border border-error/30 hover:bg-error/10 transition-colors">
                        {lang === 'ar' ? 'حذف' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-outline-variant/40 pt-5 mt-5">
              <h4 className="text-sm font-semibold text-on-surface mb-3">
                {lang === 'ar' ? 'إضافة حالة' : 'Add a status'}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
                  <input className={inputCls} value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder={lang === 'ar' ? 'مثال: بانتظار قطع الغيار' : 'e.g. Waiting for Parts'} />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                  <input className={inputCls} style={{ direction: 'rtl' }} value={draft.name_ar}
                    onChange={e => setDraft(d => ({ ...d, name_ar: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'يُطابَق مع الحالة الأساسية' : 'Maps to base status'}</label>
                  <select className={inputCls} value={draft.maps_to_base_status}
                    onChange={e => setDraft(d => ({ ...d, maps_to_base_status: e.target.value as WorkOrderStatus }))}>
                    {BASE_STATUSES.map(s => (
                      <option key={s} value={s}>{baseLabel(s, lang)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'اللون' : 'Colour'}</label>
                  <input type="color" className="w-full h-[46px] bg-surface-container-low border border-outline-variant/40 rounded-xl px-2 py-1 cursor-pointer"
                    value={draft.color}
                    onChange={e => setDraft(d => ({ ...d, color: e.target.value }))} />
                </div>
              </div>
              {error && (
                <div className="mt-3 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
              )}
              <button onClick={add} disabled={saving}
                className="mt-4 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50">
                {saving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'إضافة الحالة' : 'Add status')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
