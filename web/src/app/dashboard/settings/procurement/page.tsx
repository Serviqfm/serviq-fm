// web/src/app/dashboard/settings/procurement/page.tsx
// P1: approval threshold bands + their ordered named approvers.
//
// Writes go straight through PostgREST: procurement_approval_rules and
// _rule_steps carry admin/manager RLS policies, so the role gate is enforced in
// the database and this page only hides what it would refuse anyway (same
// posture as the cost-centers pages).
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

export default function ProcurementSettingsPage() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()

  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState('')
  const [rules, setRules] = useState<Row[]>([])
  const [users, setUsers] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newMin, setNewMin] = useState('0')
  const [newMax, setNewMax] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase
      .from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    setRole(profile.role ?? '')

    const [rRes, uRes] = await Promise.all([
      supabase.from('procurement_approval_rules')
        .select('*, steps:procurement_approval_rule_steps(*, approver:approver_user_id(full_name, email))')
        .order('min_amount'),
      supabase.from('users').select('id, full_name, email').eq('organisation_id', profile.organisation_id).order('full_name'),
    ])
    if (rRes.error) setError(rRes.error.message)
    setRules((rRes.data ?? []).map(r => ({
      ...r,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      steps: [...(r.steps ?? [])].sort((a: any, b: any) => a.step_order - b.step_order),
    })))
    setUsers(uRes.data ?? [])
    setLoading(false)
  }

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setError('')
    const { error: e } = await fn()
    if (e) { setError(e.message); return }
    load()
  }

  const addBand = () => run(async () => supabase.from('procurement_approval_rules').insert({
    organisation_id: orgId,
    min_amount: Number(newMin || 0),
    max_amount: newMax.trim() === '' ? null : Number(newMax),
  }))

  const toggleBand = (r: Row) => run(async () =>
    supabase.from('procurement_approval_rules').update({ is_active: !r.is_active }).eq('id', r.id))

  const deleteBand = (r: Row) => run(async () =>
    supabase.from('procurement_approval_rules').delete().eq('id', r.id))

  const addStep = (r: Row, approverId: string, label: string) => run(async () =>
    supabase.from('procurement_approval_rule_steps').insert({
      organisation_id: orgId,
      rule_id: r.id,
      step_order: (r.steps?.length ?? 0) + 1,
      approver_user_id: approverId,
      label: label.trim() || null,
    }))

  // Steps are renumbered on delete so the chain stays 1..n with no gaps — the RPC
  // orders by step_order, and a gap would still work, but the UI would look wrong.
  const deleteStep = (r: Row, step: Row) => run(async () => {
    const { error: delErr } = await supabase.from('procurement_approval_rule_steps').delete().eq('id', step.id)
    if (delErr) return { error: delErr }
    const rest = (r.steps ?? []).filter((s: Row) => s.id !== step.id)
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].step_order !== i + 1) {
        const { error: e } = await supabase.from('procurement_approval_rule_steps')
          .update({ step_order: i + 1 }).eq('id', rest[i].id)
        if (e) return { error: e }
      }
    }
    return { error: null }
  })

  const isPrivileged = role === 'admin' || role === 'manager'
  const fieldCls = 'bg-surface-container-low border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

  if (loading) return <div className="p-8 text-on-surface-variant">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>

  return (
    <div className="p-6 max-w-3xl mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {isAr ? 'موافقات المشتريات' : 'Procurement approvals'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {isAr
          ? 'حدّد حدود المبالغ ومن يوافق عليها بالترتيب. يُختار الحد المطابق لإجمالي الطلب عند الإرسال.'
          : 'Amount bands and who approves them, in order. The band containing a requisition total is picked at submit time.'}
      </p>

      {!isPrivileged ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 text-sm text-on-surface-variant">
          {isAr
            ? 'هذه الإعدادات متاحة لمسؤولي ومديري المؤسسة فقط.'
            : 'These settings are available to organisation admins and managers only.'}
        </div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
          )}

          {rules.length === 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 text-sm text-on-surface-variant">
              {isAr
                ? 'لا توجد حدود بعد — تتم الموافقة على كل الطلبات تلقائياً حتى تضيف حداً واحداً على الأقل.'
                : 'No bands yet — every requisition auto-approves until you add at least one.'}
            </div>
          )}

          {rules.map(r => (
            <BandCard key={r.id} rule={r} users={users} isAr={isAr} fieldCls={fieldCls}
              onToggle={() => toggleBand(r)} onDelete={() => deleteBand(r)}
              onAddStep={(u, l) => addStep(r, u, l)} onDeleteStep={s => deleteStep(r, s)} />
          ))}

          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
            <h2 className="text-sm font-semibold text-on-surface mb-3">{isAr ? 'إضافة حد' : 'Add a band'}</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  {isAr ? 'من (شامل)' : 'From (inclusive)'}
                </label>
                <input type="number" min="0" step="any" value={newMin} onChange={e => setNewMin(e.target.value)} className={`${fieldCls} w-32`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  {isAr ? 'إلى (غير شامل، فارغ = بلا حد)' : 'To (exclusive, blank = no limit)'}
                </label>
                <input type="number" min="0" step="any" value={newMax} onChange={e => setNewMax(e.target.value)} className={`${fieldCls} w-48`} />
              </div>
              <button onClick={addBand}
                className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm">
                {isAr ? 'إضافة' : 'Add'}
              </button>
            </div>
          </div>

          <p className="text-xs text-on-surface-variant">
            {isAr
              ? 'لا يوجد حد مطابق؟ تتم الموافقة تلقائياً. تُثبَّت السلسلة عند الإرسال، فتعديل الحدود لا يغيّر طلباً قيد الموافقة.'
              : 'No matching band means auto-approval. The chain is frozen at submit time, so editing bands never rewrites a requisition already in flight.'}
            {' '}
            <Link href="/dashboard/procurement/requisitions" className="text-primary hover:underline">
              {isAr ? 'فتح طلبات الشراء' : 'Open requisitions'}
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}

function BandCard({ rule, users, isAr, fieldCls, onToggle, onDelete, onAddStep, onDeleteStep }: {
  rule: Row; users: Row[]; isAr: boolean; fieldCls: string
  onToggle: () => void; onDelete: () => void
  onAddStep: (approverId: string, label: string) => void
  onDeleteStep: (step: Row) => void
}) {
  const [approverId, setApproverId] = useState('')
  const [label, setLabel] = useState('')

  const range = rule.max_amount == null
    ? `${Number(rule.min_amount).toLocaleString()} ${isAr ? 'فأكثر' : 'and above'}`
    : `${Number(rule.min_amount).toLocaleString()} – ${Number(rule.max_amount).toLocaleString()}`

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-sm font-semibold text-on-surface">{range} SAR</div>
          <div className="text-xs text-on-surface-variant mt-0.5">
            {(rule.steps ?? []).length} {isAr ? 'خطوة موافقة' : 'approval step(s)'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onToggle}
            className={rule.is_active
              ? 'px-4 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold'
              : 'px-4 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant text-xs font-semibold border border-outline-variant'}>
            {rule.is_active ? (isAr ? 'مفعّل' : 'Active') : (isAr ? 'معطّل' : 'Inactive')}
          </button>
          <button onClick={onDelete} title={isAr ? 'حذف الحد' : 'Delete band'}
            className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors">
            <span className="material-symbols-outlined text-lg">delete</span>
          </button>
        </div>
      </div>

      <ol className="space-y-2 mb-4">
        {(rule.steps ?? []).map((s: Row) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
              {s.step_order}
            </span>
            <span className="text-on-surface">{s.approver?.full_name ?? s.approver?.email ?? '—'}</span>
            {s.label && <span className="text-on-surface-variant">· {s.label}</span>}
            <button onClick={() => onDeleteStep(s)}
              className="ms-auto p-1 rounded text-on-surface-variant hover:text-error transition-colors">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </li>
        ))}
        {(rule.steps ?? []).length === 0 && (
          <li className="text-sm text-on-surface-variant">
            {isAr ? 'لا يوجد معتمدون — سيوافق النظام تلقائياً.' : 'No approvers — requisitions in this band auto-approve.'}
          </li>
        )}
      </ol>

      <div className="flex flex-wrap items-end gap-2 border-t border-outline-variant/30 pt-4">
        <select value={approverId} onChange={e => setApproverId(e.target.value)} className={`${fieldCls} flex-1 min-w-[180px]`}>
          <option value="">{isAr ? '— اختر معتمداً —' : '— Pick an approver —'}</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
        </select>
        <input value={label} onChange={e => setLabel(e.target.value)} className={`${fieldCls} w-40`}
          placeholder={isAr ? 'التسمية (مثل: مالية)' : 'Label (e.g. Finance)'} />
        <button onClick={() => { if (approverId) { onAddStep(approverId, label); setApproverId(''); setLabel('') } }}
          disabled={!approverId}
          className="px-4 py-2 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low disabled:opacity-40 transition-colors">
          {isAr ? 'إضافة خطوة' : 'Add step'}
        </button>
      </div>
    </div>
  )
}
