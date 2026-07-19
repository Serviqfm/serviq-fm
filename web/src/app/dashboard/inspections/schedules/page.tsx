'use client'

// CORE-26 — Recurring/scheduled inspections. CRUD over inspection_schedules
// (docs/superpowers/sql/b7-inspection-schedules.sql). The daily
// /api/cron/inspection-generate cron turns due schedules into WOs of source
// 'inspection'. A non-empty rotation (ordered space list) makes the schedule
// cycle through spaces one per generation — the hotel room-rotation case.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

const FREQUENCIES = ['daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'biannual', 'annual', 'custom'] as const

type ScheduleForm = {
  template_id: string
  site_id: string
  space_id: string
  frequency: string
  interval_days: string
  next_due_at: string
  assigned_to: string
  rotation: string[]
  is_active: boolean
}

const EMPTY_FORM: ScheduleForm = {
  template_id: '', site_id: '', space_id: '', frequency: 'monthly',
  interval_days: '', next_due_at: '', assigned_to: '', rotation: [], is_active: true,
}

export default function InspectionSchedulesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [schedules, setSchedules] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [templates, setTemplates] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [users, setUsers] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spaces, setSpaces] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM)
  const [rotationPick, setRotationPick] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const ar = lang === 'ar'

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)

    const [{ data: schedData }, { data: tmplData }, { data: siteData }, { data: userData }] = await Promise.all([
      supabase.from('inspection_schedules')
        .select('*, template:template_id(name), site:site_id(name), space:space_id(name), assignee:assigned_to(full_name)')
        .eq('organisation_id', profile.organisation_id)
        .order('next_due_at', { ascending: true }),
      supabase.from('inspection_templates').select('id, name, vertical').eq('organisation_id', profile.organisation_id),
      supabase.from('sites').select('id, name').eq('organisation_id', profile.organisation_id).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', profile.organisation_id).in('role', ['technician', 'manager']),
    ])
    if (schedData) setSchedules(schedData)
    if (tmplData) setTemplates(tmplData)
    if (siteData) setSites(siteData)
    if (userData) setUsers(userData)
    setLoading(false)
  }

  // Load the chosen site's spaces (feeds both the fixed-space select and the rotation picker).
  useEffect(() => {
    if (!form.site_id) { setSpaces([]); return }
    supabase.from('spaces').select('id, name, floor').eq('site_id', form.site_id).order('floor').order('name')
      .then(({ data }) => setSpaces(data ?? []))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.site_id])

  function openCreate() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setError('')
    setShowForm(true)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function openEdit(s: any) {
    setForm({
      template_id: s.template_id ?? '',
      site_id: s.site_id ?? '',
      space_id: s.space_id ?? '',
      frequency: s.frequency ?? 'monthly',
      interval_days: s.interval_days ? String(s.interval_days) : '',
      next_due_at: s.next_due_at ? format(new Date(s.next_due_at), 'yyyy-MM-dd') : '',
      assigned_to: s.assigned_to ?? '',
      rotation: Array.isArray(s.rotation) ? s.rotation : [],
      is_active: s.is_active !== false,
    })
    setEditingId(s.id)
    setError('')
    setShowForm(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.template_id || !form.next_due_at) { setError(ar ? 'النموذج وتاريخ الاستحقاق مطلوبان' : 'Template and next due date are required'); return }
    setSaving(true)
    setError('')
    const payload = {
      organisation_id: orgId,
      template_id: form.template_id,
      site_id: form.site_id || null,
      space_id: form.space_id || null,
      frequency: form.frequency,
      interval_days: form.frequency === 'custom' && form.interval_days ? Number(form.interval_days) : null,
      next_due_at: new Date(form.next_due_at).toISOString(),
      assigned_to: form.assigned_to || null,
      rotation: form.rotation,
      is_active: form.is_active,
    }
    const { error: err } = editingId
      ? await supabase.from('inspection_schedules').update(payload).eq('id', editingId)
      : await supabase.from('inspection_schedules').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    setShowForm(false)
    setSaving(false)
    fetchAll()
  }

  async function handleDelete(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('inspection_schedules').delete().eq('id', id)
    fetchAll()
  }

  function addToRotation() {
    if (!rotationPick || form.rotation.includes(rotationPick)) return
    setForm(f => ({ ...f, rotation: [...f.rotation, rotationPick] }))
    setRotationPick('')
  }

  const spaceName = (id: string) => {
    const s = spaces.find(sp => sp.id === id)
    return s ? `${s.floor ? s.floor + ' · ' : ''}${s.name}` : id.slice(0, 8)
  }

  const freqLabel = (f: string, days?: number | null) => {
    const en: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', fortnightly: 'Fortnightly', monthly: 'Monthly', quarterly: 'Quarterly', biannual: 'Biannual', annual: 'Annual', custom: 'Custom' }
    const arr: Record<string, string> = { daily: 'يومي', weekly: 'أسبوعي', fortnightly: 'كل أسبوعين', monthly: 'شهري', quarterly: 'ربع سنوي', biannual: 'نصف سنوي', annual: 'سنوي', custom: 'مخصص' }
    const base = (ar ? arr : en)[f] ?? f
    return f === 'custom' && days ? `${base} (${days}d)` : base
  }

  const fieldCls = 'w-full px-3 py-2 border border-outline-variant rounded-lg text-sm bg-surface-container-lowest text-on-surface'
  const labelCls = 'block mb-1.5 text-[13px] font-medium text-on-surface-variant'

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Link href="/dashboard/inspections" className="text-on-surface-variant text-[13px] no-underline">{ar ? '← رجوع للتفتيش' : '← Back to Inspections'}</Link>
            <h1 className="text-3xl font-bold text-on-surface m-0 mt-1">{ar ? 'جداول التفتيش' : 'Inspection Schedules'}</h1>
            <p className="text-sm text-on-surface-variant mt-1 mb-0">
              {ar ? 'تفتيشات متكررة تُنشئ أوامر عمل تلقائياً عند الاستحقاق' : 'Recurring inspections that auto-generate work orders when due'}
            </p>
          </div>
          <button onClick={openCreate} className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
            + {ar ? 'جدول جديد' : 'New Schedule'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSave} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-on-surface m-0">
              {editingId ? (ar ? 'تعديل الجدول' : 'Edit Schedule') : (ar ? 'جدول جديد' : 'New Schedule')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>{ar ? 'النموذج *' : 'Template *'}</label>
                <select value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))} required className={fieldCls}>
                  <option value="">{ar ? 'اختر نموذجاً' : 'Select template'}</option>
                  {templates.map(tm => <option key={tm.id} value={tm.id}>{tm.name}{tm.vertical ? ` (${tm.vertical})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'الموقع' : 'Site'}</label>
                <select value={form.site_id} onChange={e => setForm(f => ({ ...f, site_id: e.target.value, space_id: '', rotation: [] }))} className={fieldCls}>
                  <option value="">{ar ? 'اختر موقعاً' : 'Select site'}</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'المساحة (ثابتة)' : 'Space (fixed)'}</label>
                <select value={form.space_id} onChange={e => setForm(f => ({ ...f, space_id: e.target.value }))} className={fieldCls} disabled={!form.site_id || form.rotation.length > 0}>
                  <option value="">{ar ? 'بدون مساحة محددة' : 'No fixed space'}</option>
                  {spaces.map(s => <option key={s.id} value={s.id}>{s.floor ? s.floor + ' · ' : ''}{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{ar ? 'التكرار *' : 'Frequency *'}</label>
                <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className={fieldCls}>
                  {FREQUENCIES.map(f => <option key={f} value={f}>{freqLabel(f)}</option>)}
                </select>
              </div>
              {form.frequency === 'custom' && (
                <div>
                  <label className={labelCls}>{ar ? 'كل كم يوم *' : 'Every N days *'}</label>
                  <input type="number" min={1} value={form.interval_days} onChange={e => setForm(f => ({ ...f, interval_days: e.target.value }))} required className={fieldCls} />
                </div>
              )}
              <div>
                <label className={labelCls}>{ar ? 'الاستحقاق التالي *' : 'Next due *'}</label>
                <input type="date" value={form.next_due_at} onChange={e => setForm(f => ({ ...f, next_due_at: e.target.value }))} required className={fieldCls} />
              </div>
              <div>
                <label className={labelCls}>{ar ? 'المسؤول' : 'Assignee'}</label>
                <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className={fieldCls}>
                  <option value="">{ar ? 'غير معيّن' : 'Unassigned'}</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
            </div>

            {form.site_id && (
              <div className="border border-outline-variant rounded-xl p-4">
                <p className="text-[13px] font-semibold text-on-surface m-0">{ar ? 'تناوب المساحات (اختياري)' : 'Space rotation (optional)'}</p>
                <p className="text-xs text-on-surface-variant mt-1 mb-3">
                  {ar
                    ? 'قائمة مرتبة من المساحات يتنقل الجدول بينها — تفتيش مساحة واحدة في كل دورة حتى تكتمل القائمة ثم يعيد الكرّة. مثال: كل غرف الفندق مرة كل ربع سنة.'
                    : 'An ordered list of spaces the schedule cycles through — one space per cycle, repeating once the list is done. E.g. every hotel room once per quarter.'}
                </p>
                <div className="flex gap-2 mb-2">
                  <select value={rotationPick} onChange={e => setRotationPick(e.target.value)} className={fieldCls + ' flex-1'}>
                    <option value="">{ar ? 'أضف مساحة للتناوب' : 'Add a space to the rotation'}</option>
                    {spaces.filter(s => !form.rotation.includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.floor ? s.floor + ' · ' : ''}{s.name}</option>)}
                  </select>
                  <button type="button" onClick={addToRotation} disabled={!rotationPick} className="px-4 py-2 rounded-lg border border-outline-variant bg-surface-container-low text-sm font-medium cursor-pointer disabled:opacity-50">
                    {ar ? 'إضافة' : 'Add'}
                  </button>
                </div>
                {form.rotation.length > 0 && (
                  <ol className="m-0 pl-0 list-none space-y-1">
                    {form.rotation.map((id, i) => (
                      <li key={id} className="flex items-center gap-2 text-sm text-on-surface bg-surface-container-low rounded-lg px-3 py-1.5">
                        <span className="text-xs text-on-surface-variant w-5">{i + 1}.</span>
                        <span className="flex-1">{spaceName(id)}</span>
                        <button type="button" onClick={() => setForm(f => ({ ...f, rotation: f.rotation.filter(r => r !== id) }))}
                          className="border-0 bg-transparent text-error cursor-pointer text-xs">{t('common.delete')}</button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {editingId && (
              <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                {ar ? 'نشط' : 'Active'}
              </label>
            )}

            {error && <p className="text-error text-[13px] m-0">{error}</p>}

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {saving ? t('common.saving') : t('common.save')}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-sm text-on-surface-variant cursor-pointer">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : schedules.length === 0 ? (
          <p className="text-on-surface-variant text-center py-12">{ar ? 'لا توجد جداول بعد' : 'No schedules yet'}</p>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  {[t('insp.col.template'), t('insp.col.site'), ar ? 'المساحة' : 'Space', ar ? 'التكرار' : 'Frequency', ar ? 'الاستحقاق التالي' : 'Next due', ar ? 'المسؤول' : 'Assignee', t('insp.col.status'), t('common.actions')].map(h => (
                    <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedules.map(s => (
                  <tr key={s.id} className="bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-primary">{s.template?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{s.site?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">
                      {Array.isArray(s.rotation) && s.rotation.length > 0
                        ? <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-medium">{ar ? `تناوب ${s.rotation.length} مساحات` : `Rotation · ${s.rotation.length} spaces`}</span>
                        : (s.space?.name ?? '—')}
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{freqLabel(s.frequency, s.interval_days)}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{s.next_due_at ? format(new Date(s.next_due_at), 'dd MMM yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{s.assignee?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      {s.is_active
                        ? <span className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-medium">{ar ? 'نشط' : 'Active'}</span>
                        : <span className="bg-surface-container-low text-on-surface-variant px-2.5 py-0.5 rounded-full text-xs font-medium">{ar ? 'متوقف' : 'Paused'}</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-1.5">
                        <button onClick={() => openEdit(s)} className="px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest cursor-pointer text-[11px] hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                        <button onClick={() => handleDelete(s.id)} className="px-2.5 py-1 rounded-lg border border-error/20 bg-error/10 text-error cursor-pointer text-[11px] hover:bg-error/20 transition-colors">{t('common.delete')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
