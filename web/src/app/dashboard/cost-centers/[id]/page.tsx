'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { woTotalsByWo } from '@/lib/woCost'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'
const money = (n: number) => `SAR ${n.toFixed(2)}`

export default function CostCenterDetailPage() {
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] || ''
  const { t, lang } = useLanguage()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [canWrite, setCanWrite] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [center, setCenter] = useState<any>(null)
  const [form, setForm] = useState({ name: '', name_ar: '', code: '', annual_budget: '' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [linked, setLinked] = useState<any[]>([])
  const [spend, setSpend] = useState<Record<string, number>>({})
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [unassigned, setUnassigned] = useState<any[]>([])
  const [pickWo, setPickWo] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [id])

  async function loadData() {
    if (!id) { setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    setCanWrite(['admin', 'manager'].includes(profile.role))

    const { data: cc } = await supabase.from('cost_centers').select('*').eq('id', id).single()
    setCenter(cc ?? null)
    if (cc) setForm({ name: cc.name ?? '', name_ar: cc.name_ar ?? '', code: cc.code ?? '', annual_budget: cc.annual_budget != null ? String(cc.annual_budget) : '' })

    await loadWorkOrders(profile.organisation_id)
    setLoading(false)
  }

  async function loadWorkOrders(org: string) {
    const [{ data: linkedWos }, { data: freeWos }] = await Promise.all([
      supabase.from('work_orders').select('id, title, status').eq('organisation_id', org).eq('cost_center_id', id).order('created_at', { ascending: false }),
      supabase.from('work_orders').select('id, title, status').eq('organisation_id', org).is('cost_center_id', null).order('created_at', { ascending: false }).limit(200),
    ])
    setLinked(linkedWos ?? [])
    setUnassigned(freeWos ?? [])

    const woIds = (linkedWos ?? []).map(w => w.id)
    if (woIds.length === 0) { setSpend({}); return }
    const [{ data: logs }, { data: costs }, { data: comments }] = await Promise.all([
      supabase.from('work_order_time_logs').select('work_order_id, minutes, hourly_rate').in('work_order_id', woIds),
      supabase.from('work_order_costs').select('work_order_id, amount').in('work_order_id', woIds),
      supabase.from('work_order_comments').select('work_order_id, body').in('work_order_id', woIds).like('body', '[ACTIVITY]%'),
    ])
    setSpend(woTotalsByWo(logs ?? [], costs ?? [], comments ?? []))
  }

  async function saveCenter(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const budget = parseFloat(form.annual_budget)
    const { error } = await supabase.from('cost_centers').update({
      name: form.name.trim(),
      name_ar: form.name_ar.trim() ? form.name_ar.trim() : null,
      code: form.code.trim() ? form.code.trim() : null,
      annual_budget: isNaN(budget) || budget < 0 ? 0 : budget,
    }).eq('id', id)
    setSaving(false)
    if (error) { alert(error.message); return }
    if (orgId) await loadData()
  }

  async function assignWo() {
    if (!pickWo) return
    const { error } = await supabase.from('work_orders').update({ cost_center_id: id }).eq('id', pickWo)
    if (error) { alert(error.message); return }
    setPickWo('')
    if (orgId) await loadWorkOrders(orgId)
  }

  async function unassignWo(woId: string) {
    const { error } = await supabase.from('work_orders').update({ cost_center_id: null }).eq('id', woId)
    if (error) { alert(error.message); return }
    if (orgId) await loadWorkOrders(orgId)
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>
  if (!center) return <div className="p-8 text-on-surface-variant">{lang === 'ar' ? 'مركز التكلفة غير موجود.' : 'Cost center not found.'}</div>

  const budget = Number(center.annual_budget || 0)
  const actual = linked.reduce((s, w) => s + (spend[w.id] ?? 0), 0)
  const variance = budget - actual
  const over = variance < 0

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[960px] mx-auto space-y-6">
        <div>
          <a href="/dashboard/cost-centers" className="text-on-surface-variant text-sm hover:text-primary transition-colors">{t('common.back')}</a>
          <h1 className="text-2xl font-bold text-on-surface mt-2">{lang === 'ar' && center.name_ar ? center.name_ar : center.name}</h1>
        </div>

        {/* Budget vs actual summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">{lang === 'ar' ? 'الميزانية السنوية' : 'Annual Budget'}</p>
            <p className="text-2xl font-bold text-on-surface mt-1">{money(budget)}</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">{lang === 'ar' ? 'الإنفاق الفعلي' : 'Actual Spend'}</p>
            <p className="text-2xl font-bold text-on-surface mt-1">{money(actual)}</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">{lang === 'ar' ? 'الفرق' : 'Variance'}</p>
            <p className={`text-2xl font-bold mt-1 ${over ? 'text-error' : 'text-primary'}`}>
              {over ? (lang === 'ar' ? 'تجاوز ' : 'Over ') : (lang === 'ar' ? 'متبقٍ ' : 'Under ')}{money(Math.abs(variance))}
            </p>
          </div>
        </div>

        {/* Edit form (admin/manager) */}
        {canWrite && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
            <h2 className="text-sm font-bold text-on-surface mb-4">{lang === 'ar' ? 'تعديل المركز' : 'Edit Center'}</h2>
            <form onSubmit={saveCenter} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} <span className="text-error">*</span></label>
                <input value={form.name} required onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                <input value={form.name_ar} dir="rtl" onChange={e => setForm(p => ({ ...p, name_ar: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{lang === 'ar' ? 'الرمز' : 'Code'}</label>
                <input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{lang === 'ar' ? 'الميزانية السنوية (ريال)' : 'Annual Budget (SAR)'}</label>
                <input type="number" min="0" step="0.01" value={form.annual_budget} onChange={e => setForm(p => ({ ...p, annual_budget: e.target.value }))} className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" disabled={saving}
                  className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Assign a work order (integration point) */}
        {canWrite && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
            <h2 className="text-sm font-bold text-on-surface mb-1">{lang === 'ar' ? 'إسناد أمر عمل' : 'Assign a Work Order'}</h2>
            <p className="text-xs text-on-surface-variant mb-4">{lang === 'ar' ? 'اربط أمر عمل بهذا المركز لتُحتسب تكلفته ضمن الإنفاق.' : 'Link a work order so its cost rolls up into this center.'}</p>
            <div className="flex gap-2.5 items-end flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <select value={pickWo} onChange={e => setPickWo(e.target.value)} className={inputCls}>
                  <option value="">{lang === 'ar' ? 'اختر أمر عمل غير مُسند…' : 'Select an unassigned work order…'}</option>
                  {unassigned.map(w => (
                    <option key={w.id} value={w.id}>{w.title}</option>
                  ))}
                </select>
              </div>
              <button onClick={assignWo} disabled={!pickWo}
                className={`bg-primary text-on-primary px-4 py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors ${!pickWo ? 'opacity-50' : ''}`}>
                {lang === 'ar' ? 'إسناد' : 'Assign'}
              </button>
            </div>
          </div>
        )}

        {/* Linked work orders */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
          <div className="p-4 border-b border-outline-variant/30">
            <h2 className="text-sm font-bold text-on-surface">{lang === 'ar' ? 'أوامر العمل المرتبطة' : 'Linked Work Orders'} ({linked.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/30">
                  {[
                    lang === 'ar' ? 'أمر العمل' : 'Work Order',
                    lang === 'ar' ? 'الحالة' : 'Status',
                    lang === 'ar' ? 'التكلفة' : 'Cost',
                    canWrite ? t('common.actions') : '',
                  ].filter(Boolean).map(h => (
                    <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {linked.length === 0 && (
                  <tr>
                    <td colSpan={canWrite ? 4 : 3} className="p-6 text-sm text-on-surface-variant text-center">
                      {lang === 'ar' ? 'لا توجد أوامر عمل مرتبطة بعد.' : 'No work orders linked yet.'}
                    </td>
                  </tr>
                )}
                {linked.map(w => (
                  <tr key={w.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="p-3">
                      <Link href={'/dashboard/work-orders/' + w.id} className="text-sm font-semibold text-on-surface hover:text-primary transition-colors">{w.title}</Link>
                    </td>
                    <td className="p-3 text-sm text-on-surface-variant">{w.status}</td>
                    <td className="p-3 text-sm text-on-surface whitespace-nowrap">{money(spend[w.id] ?? 0)}</td>
                    {canWrite && (
                      <td className="p-3">
                        <button onClick={() => unassignWo(w.id)}
                          className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">
                          {lang === 'ar' ? 'إلغاء الإسناد' : 'Unassign'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
