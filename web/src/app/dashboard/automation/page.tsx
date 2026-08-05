'use client'

// WO-27 — Automation workflow builder (MVP). List of org rules + an inline builder
// that creates one rule: a trigger, one optional condition field/value, one action.
// Writes are admin/manager-gated (RLS enforces; the builder is hidden otherwise).
// Activation lives in the DB triggers from w6-9-automation.sql — this page only
// manages rows; it never fires the rules itself.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { fetchWoCategories, catLabel, type WoCategory } from '@/lib/woCategories'

const TRIGGERS = ['wo_created', 'wo_completed'] as const
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const
const ROLES = ['admin', 'manager'] as const

const triggerLabel = (v: string, ar: boolean) => ({
  wo_created: ar ? 'عند إنشاء أمر عمل' : 'When a work order is created',
  wo_completed: ar ? 'عند اكتمال أمر عمل' : 'When a work order is completed',
}[v] ?? v)

const roleLabel = (v: string, ar: boolean) => ({
  admin: ar ? 'المسؤولون' : 'Admins', manager: ar ? 'المديرون' : 'Managers',
}[v] ?? v)

const priorityLabel = (v: string, ar: boolean) => ({
  critical: ar ? 'حرج' : 'Critical', high: ar ? 'عالٍ' : 'High',
  medium: ar ? 'متوسط' : 'Medium', low: ar ? 'منخفض' : 'Low',
}[v] ?? v)

export default function AutomationPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([])
  const [categories, setCategories] = useState<WoCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState('')
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const ar = lang === 'ar'

  const [form, setForm] = useState({
    name: '', trigger_event: 'wo_created',
    condField: '' as '' | 'priority' | 'category', condValue: '',
    role: 'admin',
  })

  const canManage = role === 'admin' || role === 'manager'

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    setRole(profile.role)
    const [{ data }, cats] = await Promise.all([
      supabase.from('automation_rules').select('*').eq('organisation_id', profile.organisation_id).order('created_at', { ascending: false }),
      fetchWoCategories(supabase),
    ])
    if (data) setRows(data)
    setCategories(cats)
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError(ar ? 'اسم القاعدة مطلوب' : 'Rule name is required'); return }
    if (form.condField && !form.condValue) { setError(ar ? 'اختر قيمة الشرط' : 'Pick a condition value'); return }
    setSaving(true); setError('')
    const condition = form.condField ? { [form.condField]: form.condValue } : {}
    const { error: insErr } = await supabase.from('automation_rules').insert({
      organisation_id: orgId,
      name: form.name.trim(),
      trigger_event: form.trigger_event,
      condition,
      action: { type: 'notify_role', role: form.role },
      created_by: userId,
    })
    if (insErr) { setError(insErr.message); setSaving(false); return }
    setForm({ name: '', trigger_event: 'wo_created', condField: '', condValue: '', role: 'admin' })
    setSaving(false)
    load()
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('automation_rules').update({ is_active: !current }).eq('id', id)
    load()
  }

  async function remove(id: string) {
    if (!confirm(ar ? 'حذف هذه القاعدة؟' : 'Delete this rule?')) return
    await supabase.from('automation_rules').delete().eq('id', id)
    load()
  }

  function condSummary(c: Record<string, string>): string {
    const keys = Object.keys(c || {})
    if (keys.length === 0) return ar ? 'أي أمر عمل' : 'Any work order'
    if (c.priority) return (ar ? 'الأولوية = ' : 'Priority = ') + priorityLabel(c.priority, ar)
    if (c.category) return (ar ? 'الفئة = ' : 'Category = ') + c.category
    return keys.map(k => `${k}=${c[k]}`).join(', ')
  }

  const fieldStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #ddd',
    borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white',
  }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1100px] mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-on-surface m-0">{ar ? 'الأتمتة' : 'Automation'}</h1>
          <p className="text-sm text-on-surface-variant mt-1 mb-0">
            {ar ? 'قواعد تتفاعل مع أحداث أوامر العمل' : 'Rules that react to work-order events'} &middot; {rows.length} {ar ? 'قاعدة' : 'rules'}
          </p>
        </div>

        {canManage && (
          <form onSubmit={handleCreate} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-on-surface m-0">{ar ? 'قاعدة جديدة' : 'New rule'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>{ar ? 'اسم القاعدة' : 'Rule name'} *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={fieldStyle}
                  placeholder={ar ? 'مثال: تنبيه المسؤولين بالأعطال الحرجة' : 'e.g. Alert admins on critical WOs'} />
              </div>

              <div>
                <label style={labelStyle}>{ar ? 'المُشغِّل (متى)' : 'Trigger (when)'}</label>
                <select value={form.trigger_event} onChange={e => setForm({ ...form, trigger_event: e.target.value })} style={fieldStyle}>
                  {TRIGGERS.map(v => <option key={v} value={v}>{triggerLabel(v, ar)}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>{ar ? 'الشرط (اختياري)' : 'Condition (optional)'}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={form.condField}
                    onChange={e => setForm({ ...form, condField: e.target.value as typeof form.condField, condValue: '' })}
                    style={{ ...fieldStyle, flex: 1 }}>
                    <option value=''>{ar ? 'أي شيء' : 'Any'}</option>
                    <option value='priority'>{ar ? 'الأولوية' : 'Priority'}</option>
                    <option value='category'>{ar ? 'الفئة' : 'Category'}</option>
                  </select>
                  {form.condField === 'priority' && (
                    <select value={form.condValue} onChange={e => setForm({ ...form, condValue: e.target.value })} style={{ ...fieldStyle, flex: 1 }}>
                      <option value=''>{ar ? 'اختر' : 'Select'}</option>
                      {PRIORITIES.map(p => <option key={p} value={p}>{priorityLabel(p, ar)}</option>)}
                    </select>
                  )}
                  {form.condField === 'category' && (
                    <select value={form.condValue} onChange={e => setForm({ ...form, condValue: e.target.value })} style={{ ...fieldStyle, flex: 1 }}>
                      <option value=''>{ar ? 'اختر' : 'Select'}</option>
                      {categories.map(c => <option key={c.name} value={c.name}>{catLabel(c, lang)}</option>)}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label style={labelStyle}>{ar ? 'الإجراء: إشعار' : 'Action: notify'}</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={fieldStyle}>
                  {ROLES.map(r => <option key={r} value={r}>{roleLabel(r, ar)}</option>)}
                </select>
              </div>
            </div>

            {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}

            <button type='submit' disabled={saving}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-70">
              {saving ? t('common.saving') : (ar ? 'إنشاء القاعدة' : 'Create rule')}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-on-surface-variant text-center py-12">{ar ? 'لا توجد قواعد بعد' : 'No rules yet'}</p>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant">
                  {[ar ? 'الاسم' : 'Name', ar ? 'المُشغِّل' : 'Trigger', ar ? 'الشرط' : 'Condition',
                    ar ? 'الإجراء' : 'Action', ar ? 'الحالة' : 'Status', canManage ? t('common.actions') : ''].map((h, i) => (
                    <th key={i} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-on-surface">{r.name}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{triggerLabel(r.trigger_event, ar)}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{condSummary(r.condition)}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">
                      {(ar ? 'إشعار ' : 'Notify ') + roleLabel(r.action?.role, ar)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`${r.is_active ? 'bg-primary/10 text-primary' : 'bg-surface-container-low text-on-surface-variant'} px-2.5 py-0.5 rounded-full text-xs font-medium`}>
                        {r.is_active ? (ar ? 'نشط' : 'Active') : (ar ? 'متوقف' : 'Off')}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <button onClick={() => toggleActive(r.id, r.is_active)}
                          className="px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest cursor-pointer text-[11px] hover:bg-surface-container-low transition-colors mr-2">
                          {r.is_active ? (ar ? 'إيقاف' : 'Disable') : (ar ? 'تفعيل' : 'Enable')}
                        </button>
                        <button onClick={() => remove(r.id)}
                          className="px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest cursor-pointer text-[11px] text-error hover:bg-surface-container-low transition-colors">
                          {t('common.delete')}
                        </button>
                      </td>
                    )}
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
