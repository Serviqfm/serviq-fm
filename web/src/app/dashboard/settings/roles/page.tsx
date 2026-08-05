// web/src/app/dashboard/settings/roles/page.tsx
// W6-11 / 1C-32 — admin-only CRUD for custom roles.
//
// A custom role NEVER changes users.role and NEVER grants anything: it is a
// SUBTRACTIVE overlay. Every toggle reads "this role MAY …"; unchecking one
// REMOVES that capability from what the user's real base role could otherwise do.
// Writes go through the org-scoped Supabase client — RLS restricts them to the
// caller's org AND the admin role.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { CAPABILITIES, type CapabilityMap, type CustomRole } from '@/lib/customRoles'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

const BASE_ROLES = ['admin', 'manager', 'technician', 'requester'] as const
const baseRoleLabel = (r: string, lang: string) => ({
  admin:      lang === 'ar' ? 'مدير النظام' : 'Admin',
  manager:    lang === 'ar' ? 'مدير' : 'Manager',
  technician: lang === 'ar' ? 'فني' : 'Technician',
  requester:  lang === 'ar' ? 'مقدم طلب' : 'Requester',
}[r] ?? r)

// Every capability starts ON — a new custom role is exactly its base role until
// the admin unchecks something.
const emptyDraft = { name: '', name_ar: '', base_role: 'technician' as string, permissions: {} as CapabilityMap }

export default function CustomRolesPage() {
  const { lang } = useLanguage()
  const supabase = createClient()
  const isAr = lang === 'ar'
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState('')
  const [rows, setRows] = useState<CustomRole[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

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
      .from('custom_roles').select('*').eq('organisation_id', profile.organisation_id).order('name')
    if (data) setRows(data as CustomRole[])
    setLoading(false)
  }

  function toggleCap(key: string) {
    setDraft(d => {
      const next = { ...d.permissions } as Record<string, boolean>
      // Present-and-false = denied; absent = allowed. Keep the map sparse.
      if (next[key] === false) delete next[key]; else next[key] = false
      return { ...d, permissions: next as CapabilityMap }
    })
  }

  function startEdit(row: CustomRole) {
    setEditingId(row.id)
    setError('')
    setDraft({
      name: row.name,
      name_ar: row.name_ar ?? '',
      base_role: row.base_role,
      permissions: row.permissions ?? {},
    })
  }

  function cancelEdit() { setEditingId(null); setDraft(emptyDraft); setError('') }

  async function save() {
    setError('')
    const name = draft.name.trim()
    if (!name) { setError(isAr ? 'الاسم مطلوب' : 'Name is required'); return }
    if (rows.some(r => r.id !== editingId && r.name.toLowerCase() === name.toLowerCase())) {
      setError(isAr ? 'يوجد دور بنفس الاسم' : 'A role with this name already exists'); return
    }
    setSaving(true)
    const payload = {
      name,
      name_ar: draft.name_ar.trim() || null,
      base_role: draft.base_role,
      permissions: draft.permissions,
    }
    const { error: err } = editingId
      ? await supabase.from('custom_roles').update(payload).eq('id', editingId)
      : await supabase.from('custom_roles').insert({ organisation_id: orgId, ...payload })
    setSaving(false)
    if (err) { setError(err.message); return }
    cancelEdit()
    load()
  }

  async function remove(id: string) {
    if (!confirm(isAr
      ? 'حذف هذا الدور؟ يعود المستخدمون المرتبطون به إلى صلاحيات دورهم الأساسي الكاملة.'
      : 'Delete this role? Users assigned to it revert to the full permissions of their base role.')) return
    await supabase.from('custom_roles').delete().eq('id', id)
    load()
  }

  async function toggleActive(row: CustomRole) {
    await supabase.from('custom_roles').update({ is_active: !row.is_active }).eq('id', row.id)
    load()
  }

  const deniedCount = (p: CapabilityMap | null) =>
    CAPABILITIES.filter(c => p?.[c.key] === false).length

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {isAr ? 'الأدوار المخصّصة' : 'Custom Roles'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {isAr
          ? 'الأدوار المخصّصة تُقيّد فقط: تبدأ من دور أساسي وتزيل منه صلاحيات. لا يمكن لأي دور مخصّص منح صلاحية لا يملكها دور المستخدم الأساسي.'
          : 'Custom roles only restrict. They start from a base role and take capabilities away — a custom role can never grant a permission the user’s base role does not already have.'}
      </p>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        {loading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : role !== 'admin' ? (
          <p className="text-sm text-on-surface-variant">
            {isAr ? 'هذه الإعدادات متاحة لمسؤولي المؤسسة فقط.' : 'These settings are available to organisation admins only.'}
          </p>
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="text-sm text-on-surface-variant mb-4">
                {isAr ? 'لا توجد أدوار مخصّصة بعد.' : 'No custom roles yet.'}
              </p>
            ) : (
              <div className="space-y-2 mb-4">
                {rows.map(row => (
                  <div key={row.id} className="flex items-center justify-between gap-4 py-2 border-b border-outline-variant/40 last:border-0">
                    <div className="min-w-0">
                      <div className="text-sm text-on-surface font-medium truncate">
                        {isAr && row.name_ar ? row.name_ar : row.name}
                        {!row.is_active && <span className="ml-2 text-[11px] text-on-surface-variant">({isAr ? 'غير نشط' : 'inactive'})</span>}
                      </div>
                      <div className="text-[11px] text-on-surface-variant">
                        {(isAr ? 'مبني على: ' : 'Based on: ') + baseRoleLabel(row.base_role, lang)}
                        {' · '}
                        {deniedCount(row.permissions) === 0
                          ? (isAr ? 'بدون قيود' : 'no restrictions')
                          : `${deniedCount(row.permissions)} ${isAr ? 'صلاحية مُزالة' : 'capabilities removed'}`}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => startEdit(row)}
                        className="px-3 py-1 rounded-full text-xs text-primary border border-primary/30 hover:bg-primary/10 transition-colors">
                        {isAr ? 'تعديل' : 'Edit'}
                      </button>
                      <button onClick={() => toggleActive(row)}
                        className="px-3 py-1 rounded-full text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container-low transition-colors">
                        {row.is_active ? (isAr ? 'تعطيل' : 'Disable') : (isAr ? 'تفعيل' : 'Enable')}
                      </button>
                      <button onClick={() => remove(row.id)}
                        className="px-3 py-1 rounded-full text-xs text-error border border-error/30 hover:bg-error/10 transition-colors">
                        {isAr ? 'حذف' : 'Delete'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-outline-variant/40 pt-5 mt-5">
              <h4 className="text-sm font-semibold text-on-surface mb-3">
                {editingId ? (isAr ? 'تعديل الدور' : 'Edit role') : (isAr ? 'إضافة دور' : 'Add a role')}
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
                  <input className={inputCls} value={draft.name}
                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                    placeholder={isAr ? 'مثال: فني بدون حذف' : 'e.g. Read-only Manager'} />
                </div>
                <div>
                  <label className={labelCls}>{isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                  <input className={inputCls} style={{ direction: 'rtl' }} value={draft.name_ar}
                    onChange={e => setDraft(d => ({ ...d, name_ar: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>{isAr ? 'الدور الأساسي (الحد الأعلى)' : 'Base role (the ceiling)'}</label>
                  <select className={inputCls} value={draft.base_role}
                    onChange={e => setDraft(d => ({ ...d, base_role: e.target.value }))}>
                    {BASE_ROLES.map(r => <option key={r} value={r}>{baseRoleLabel(r, lang)}</option>)}
                  </select>
                  <p className="text-[11px] text-on-surface-variant mt-1.5">
                    {isAr
                      ? 'قالب فقط. الصلاحيات الفعلية تبقى محكومة بدور المستخدم في حسابه.'
                      : 'A template only. What a user can actually do stays governed by the role on their account.'}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <label className={labelCls}>{isAr ? 'الصلاحيات' : 'Capabilities'}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-surface-container-low rounded-xl p-3">
                  {CAPABILITIES.map(c => {
                    const allowed = draft.permissions[c.key] !== false
                    return (
                      <label key={c.key} className="flex items-center gap-2 text-sm text-on-surface cursor-pointer py-1">
                        <input type="checkbox" checked={allowed} onChange={() => toggleCap(c.key)} className="w-4 h-4" />
                        <span>{isAr ? `قد ${c.ar}` : `May ${c.en.toLowerCase()}`}</span>
                      </label>
                    )
                  })}
                </div>
                <p className="text-[11px] text-on-surface-variant mt-1.5">
                  {isAr ? 'إلغاء التحديد يزيل الصلاحية من هذا الدور.' : 'Unchecking a box removes that capability from this role.'}
                </p>
              </div>

              {error && (
                <div className="mt-3 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={save} disabled={saving}
                  className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50">
                  {saving ? (isAr ? 'جاري الحفظ…' : 'Saving…') : editingId ? (isAr ? 'حفظ التغييرات' : 'Save changes') : (isAr ? 'إضافة الدور' : 'Add role')}
                </button>
                {editingId && (
                  <button onClick={cancelEdit}
                    className="px-5 py-2.5 rounded-xl border border-outline-variant text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
