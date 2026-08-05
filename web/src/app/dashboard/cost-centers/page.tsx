'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { woTotalsByWo } from '@/lib/woCost'

const money = (n: number) => `SAR ${n.toFixed(2)}`

export default function CostCentersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [centers, setCenters] = useState<any[]>([])
  // per-center rolled-up actual spend
  const [actuals, setActuals] = useState<Record<string, number>>({})
  const supabase = createClient()
  const { t, lang } = useLanguage()

  const canWrite = currentUser && ['admin', 'manager'].includes(currentUser.role)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
      const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
      setCurrentUser(profile ?? null)
      if (profile) { setOrgId(profile.organisation_id); await load(profile.organisation_id) }
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load(org: string) {
    const { data: cc } = await supabase.from('cost_centers').select('*')
      .eq('organisation_id', org).order('name', { ascending: true })
    setCenters(cc ?? [])

    // Linked work orders → roll their labor+parts+additional cost up to the center.
    const { data: wos } = await supabase.from('work_orders')
      .select('id, cost_center_id').eq('organisation_id', org).not('cost_center_id', 'is', null)
    const woIds = (wos ?? []).map(w => w.id)
    if (woIds.length === 0) { setActuals({}); return }

    const [{ data: logs }, { data: costs }, { data: comments }] = await Promise.all([
      supabase.from('work_order_time_logs').select('work_order_id, minutes, hourly_rate').in('work_order_id', woIds),
      supabase.from('work_order_costs').select('work_order_id, amount').in('work_order_id', woIds),
      supabase.from('work_order_comments').select('work_order_id, body').in('work_order_id', woIds).like('body', '[ACTIVITY]%'),
    ])
    const perWo = woTotalsByWo(logs ?? [], costs ?? [], comments ?? [])
    const perCenter: Record<string, number> = {}
    for (const w of wos ?? []) perCenter[w.cost_center_id] = (perCenter[w.cost_center_id] ?? 0) + (perWo[w.id] ?? 0)
    setActuals(perCenter)
  }

  async function deleteCenter(id: string, name: string) {
    const msg = lang === 'ar'
      ? `هل أنت متأكد من حذف مركز التكلفة "${name}"؟ لن يتم حذف أوامر العمل المرتبطة به.`
      : `Delete cost center "${name}"? Linked work orders will be kept (just un-assigned).`
    if (!confirm(msg)) return
    const { error } = await supabase.from('cost_centers').delete().eq('id', id)
    if (error) { alert(lang === 'ar' ? 'تعذر الحذف' : 'Failed to delete'); return }
    if (orgId) await load(orgId)
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{lang === 'ar' ? 'مراكز التكلفة' : 'Cost Centers'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {lang === 'ar' ? 'الميزانية مقابل الإنفاق الفعلي (عمالة + قطع + تكاليف أخرى)' : 'Budget vs. actual spend (labor + parts + other costs)'}
            </p>
          </div>
          {canWrite && (
            <Link href="/dashboard/cost-centers/new">
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">add</span>
                {lang === 'ar' ? 'مركز تكلفة جديد' : 'New Cost Center'}
              </button>
            </Link>
          )}
        </div>

        {/* Table */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/30">
                  {[
                    lang === 'ar' ? 'الاسم' : 'Name',
                    lang === 'ar' ? 'الرمز' : 'Code',
                    lang === 'ar' ? 'الميزانية السنوية' : 'Annual Budget',
                    lang === 'ar' ? 'الإنفاق الفعلي' : 'Actual Spend',
                    lang === 'ar' ? 'الفرق' : 'Variance',
                    t('common.actions'),
                  ].map(h => (
                    <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {centers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-sm text-on-surface-variant text-center">
                      {lang === 'ar' ? 'لا توجد مراكز تكلفة بعد.' : 'No cost centers yet.'}
                    </td>
                  </tr>
                )}
                {centers.map(c => {
                  const budget = Number(c.annual_budget || 0)
                  const actual = actuals[c.id] ?? 0
                  const variance = budget - actual
                  const over = variance < 0
                  return (
                    <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="p-3">
                        <Link href={'/dashboard/cost-centers/' + c.id} className="text-sm font-semibold text-on-surface hover:text-primary transition-colors">
                          {lang === 'ar' && c.name_ar ? c.name_ar : c.name}
                        </Link>
                        {c.name_ar && lang !== 'ar' && (
                          <p className="text-xs text-on-surface-variant mt-0.5" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>{c.name_ar}</p>
                        )}
                      </td>
                      <td className="p-3 text-sm text-on-surface-variant">{c.code || '—'}</td>
                      <td className="p-3 text-sm text-on-surface whitespace-nowrap">{money(budget)}</td>
                      <td className="p-3 text-sm text-on-surface whitespace-nowrap">{money(actual)}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${over ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}>
                          {over ? (lang === 'ar' ? 'تجاوز ' : 'Over ') : (lang === 'ar' ? 'متبقٍ ' : 'Under ')}
                          {money(Math.abs(variance))}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Link href={'/dashboard/cost-centers/' + c.id}>
                            <button className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{lang === 'ar' ? 'عرض' : 'View'}</button>
                          </Link>
                          {canWrite && (
                            <button onClick={() => deleteCenter(c.id, lang === 'ar' && c.name_ar ? c.name_ar : c.name)}
                              className="px-3 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">
                              {lang === 'ar' ? 'حذف' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
