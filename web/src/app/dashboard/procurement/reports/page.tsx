// web/src/app/dashboard/procurement/reports/page.tsx
// P6: procurement reporting — spend by vendor / category / cost center / month,
// cycle time per stage, vendor performance, and budget vs actual.
//
// Every number on this page comes from lib/procurementReports.ts, which is pure
// and unit-tested; this file only fetches rows and draws them. Nothing is
// computed inline, so a chart cannot quietly disagree with its own maths.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { exportCSV } from '@/lib/csv'
import {
  spendByVendor, spendByCategory, spendByCostCenter, spendByMonth,
  cycleTime, vendorPerformance, poTotal, isCommitted,
  type PoForReport, type RequisitionForReport, type SpendRow,
} from '@/lib/procurementReports'
import { budgetUsage } from '@/lib/budget'

const CHART_COLORS = ['#006b54', '#00677d', '#4f5e82', '#76d8b9', '#68d4f3', '#f57f17', '#ba1a1a', '#bdc9c3']
const TOOLTIP_STYLE = { fontFamily: 'DM Sans, sans-serif', fontSize: 12, borderRadius: 8, border: '1px solid #bdc9c3' }
const TICK_STYLE = { fontSize: 11, fontFamily: 'DM Sans, sans-serif', fill: '#3e4944' }

const money = (n: number) => n.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type BudgetRow = {
  costCenter: string
  amount: number
  reserved: number
  actual: number
  percent: number | null
}

export default function ProcurementReportsPage() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()

  const [pos, setPos] = useState<PoForReport[]>([])
  const [reqs, setReqs] = useState<RequisitionForReport[]>([])
  const [ccByReq, setCcByReq] = useState<Record<string, string | null>>({})
  const [budgets, setBudgets] = useState<BudgetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase
      .from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const org = profile.organisation_id

    const [poRes, reqRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('id, status, created_at, sent_at, received_at, expected_at, requisition_id, vendor:vendor_id(company_name), items:purchase_order_items(quantity, unit_cost, item:item_id(category))')
        .eq('organisation_id', org),
      // Tolerated: a tenant without the P1 migration has no requisitions, which
      // costs the cycle-time and cost-center views but not the spend charts.
      supabase.from('requisitions')
        .select('id, status, created_at, submitted_at, decided_at, cost_center_id, cost_center:cost_center_id(name)')
        .eq('organisation_id', org),
    ])

    if (poRes.error) setError(poRes.error.message)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPos((poRes.data ?? []).map((p: any) => ({
      id: p.id,
      status: p.status,
      created_at: p.created_at,
      sent_at: p.sent_at,
      received_at: p.received_at,
      expected_at: p.expected_at,
      requisition_id: p.requisition_id,
      vendor_name: p.vendor?.company_name ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines: (p.items ?? []).map((l: any) => ({
        quantity: l.quantity, unit_cost: l.unit_cost, category: l.item?.category ?? null,
      })),
    })))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqRows: any[] = reqRes.error ? [] : (reqRes.data ?? [])
    setReqs(reqRows.map(r => ({
      id: r.id, status: r.status, created_at: r.created_at,
      submitted_at: r.submitted_at, decided_at: r.decided_at,
      cost_center_name: r.cost_center?.name ?? null,
    })))
    setCcByReq(Object.fromEntries(reqRows.map(r => [r.id, r.cost_center?.name ?? null])))

    await loadBudgets(org)
    setLoading(false)
  }

  async function loadBudgets(org: string) {
    const today = new Date().toISOString().slice(0, 10)
    const { data: periods, error: pErr } = await supabase
      .from('budget_periods')
      .select('id, amount, starts_on, ends_on, cost_center_id, cost_center:cost_center_id(name)')
      .eq('organisation_id', org)
      .lte('starts_on', today)
      .gte('ends_on', today)
    // No P5 migration, or no periods configured: the panel simply doesn't render.
    if (pErr || !periods || periods.length === 0) { setBudgets([]); return }

    const rows = await Promise.all(periods.map(async p => {
      const { data: sp } = await supabase.rpc('budget_spend', {
        p_cost_center: p.cost_center_id, p_from: p.starts_on, p_to: p.ends_on,
      }).maybeSingle() as { data: { reserved: number; actual: number } | null }
      const reserved = Number(sp?.reserved ?? 0)
      const actual = Number(sp?.actual ?? 0)
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        costCenter: (p.cost_center as any)?.name ?? '—',
        amount: Number(p.amount ?? 0),
        reserved,
        actual,
        percent: budgetUsage({ reserved, actual, amount: Number(p.amount ?? 0) }).percent,
      }
    }))
    setBudgets(rows.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1)))
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>

  const byVendor = spendByVendor(pos)
  const byCategory = spendByCategory(pos)
  const byCostCenter = spendByCostCenter(pos, ccByReq)
  const byMonth = spendByMonth(pos)
  const cycle = cycleTime(reqs, pos)
  const vendors = vendorPerformance(pos)
  const totalSpend = pos.filter(isCommitted).reduce((s, p) => s + poTotal(p), 0)

  const stages = [
    { key: 'requestToApproval', en: 'Request → Approval', ar: 'الطلب ← الموافقة', value: cycle.requestToApproval, n: cycle.samples.requestToApproval },
    { key: 'approvalToOrder', en: 'Approval → Order sent', ar: 'الموافقة ← إرسال الأمر', value: cycle.approvalToOrder, n: cycle.samples.approvalToOrder },
    { key: 'orderToDelivery', en: 'Order → Delivered', ar: 'الأمر ← الاستلام', value: cycle.orderToDelivery, n: cycle.samples.orderToDelivery },
    { key: 'endToEnd', en: 'End to end', ar: 'من البداية للنهاية', value: cycle.endToEnd, n: cycle.samples.endToEnd },
  ]

  function Chart({ title, rows, layout }: { title: string; rows: SpendRow[]; layout?: 'vertical' }) {
    return (
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-bold text-on-surface">{title}</h2>
          <button onClick={() => exportCSV(`${title.replace(/\s+/g, '-').toLowerCase()}.csv`,
            rows.map(r => ({ name: r.name, total_sar: r.value })))}
            className="text-primary text-xs font-semibold hover:underline">CSV</button>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-8 text-center">
            {isAr ? 'لا توجد بيانات بعد.' : 'No data yet.'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            {layout === 'vertical' ? (
              <BarChart data={rows} layout="vertical" barSize={16}>
                <XAxis type="number" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => money(Number(v ?? 0))} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            ) : (
              <BarChart data={rows} barSize={24}>
                <XAxis dataKey="name" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: unknown) => money(Number(v ?? 0))} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    )
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-[1200px] mx-auto space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">
              {isAr ? 'تقارير المشتريات' : 'Procurement Reports'}
            </h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {isAr ? 'إجمالي الالتزامات' : 'Total committed'}: <strong className="text-on-surface">{money(totalSpend)} SAR</strong>
              {' · '}{pos.length} {isAr ? 'أمر شراء' : 'purchase orders'}
            </p>
          </div>
          <div className="flex gap-2">
            <a href="/api/procurement/reports/pdf" target="_blank" rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-colors text-sm font-semibold">
              <span className="material-symbols-outlined text-base">picture_as_pdf</span>PDF
            </a>
            <Link href="/dashboard/procurement"
              className="flex items-center px-4 py-2.5 border border-outline-variant text-on-surface-variant rounded-xl hover:bg-surface-container-low transition-colors text-sm font-semibold">
              {isAr ? 'المشتريات' : 'Procurement'}
            </Link>
          </div>
        </div>

        {error && <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>}

        {/* Cycle time */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stages.map(s => (
            <div key={s.key} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-secondary">{isAr ? s.ar : s.en}</p>
              <p className="text-3xl font-bold text-on-surface mt-1">
                {s.value === null ? '—' : s.value}
                {s.value !== null && <span className="text-sm font-semibold text-on-surface-variant ms-1">{isAr ? 'يوم' : 'days'}</span>}
              </p>
              <p className="text-xs text-outline mt-1">
                {s.n} {isAr ? 'سجل' : s.n === 1 ? 'record' : 'records'}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Chart title={isAr ? 'الإنفاق حسب المورد' : 'Spend by vendor'} rows={byVendor} layout="vertical" />
          <Chart title={isAr ? 'الإنفاق حسب الفئة' : 'Spend by category'} rows={byCategory} layout="vertical" />
          <Chart title={isAr ? 'الإنفاق حسب مركز التكلفة' : 'Spend by cost center'} rows={byCostCenter} layout="vertical" />
          <Chart title={isAr ? 'الإنفاق حسب الشهر' : 'Spend by month'} rows={byMonth} />
        </div>

        {/* Budget vs actual */}
        {budgets.length > 0 && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-bold text-on-surface">
                {isAr ? 'الميزانية مقابل الفعلي (الفترة الحالية)' : 'Budget vs actual (current period)'}
              </h2>
              <button onClick={() => exportCSV('budget-vs-actual.csv', budgets.map(b => ({
                cost_center: b.costCenter, budget_sar: b.amount, reserved_sar: b.reserved,
                actual_sar: b.actual, used_percent: b.percent ?? '',
              })))} className="text-primary text-xs font-semibold hover:underline">CSV</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    {[
                      isAr ? 'مركز التكلفة' : 'Cost center',
                      isAr ? 'الميزانية' : 'Budget',
                      isAr ? 'محجوز' : 'Reserved',
                      isAr ? 'فعلي' : 'Actual',
                      isAr ? 'المستخدم' : 'Used',
                    ].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {budgets.map(b => (
                    <tr key={b.costCenter}>
                      <td className="px-4 py-3 text-sm text-on-surface">{b.costCenter}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">{money(b.amount)}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">{money(b.reserved)}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">{money(b.actual)}</td>
                      <td className={`px-4 py-3 text-sm font-semibold whitespace-nowrap ${
                        b.percent === null ? 'text-on-surface-variant'
                          : b.percent >= 100 ? 'text-error' : b.percent >= 75 ? 'text-secondary' : 'text-primary'
                      }`}>
                        {b.percent === null ? '—' : `${b.percent}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Vendor performance */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-bold text-on-surface">
              {isAr ? 'أداء الموردين' : 'Vendor performance'}
            </h2>
            <button onClick={() => exportCSV('vendor-performance.csv', vendors.map(v => ({
              vendor: v.vendor, spend_sar: v.spend, open_pos: v.openPos,
              received_pos: v.receivedPos, on_time_percent: v.onTimePercent ?? '',
            })))} className="text-primary text-xs font-semibold hover:underline">CSV</button>
          </div>
          {vendors.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-8 text-center">
              {isAr ? 'لا توجد بيانات بعد.' : 'No data yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant/30">
                    {[
                      isAr ? 'المورد' : 'Vendor',
                      isAr ? 'الإنفاق' : 'Spend',
                      isAr ? 'أوامر مفتوحة' : 'Open POs',
                      isAr ? 'مستلمة' : 'Received',
                      isAr ? 'التسليم في الموعد' : 'On time',
                    ].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {vendors.map(v => (
                    <tr key={v.vendor}>
                      <td className="px-4 py-3 text-sm text-on-surface">{v.vendor}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant whitespace-nowrap">{money(v.spend)}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{v.openPos}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{v.receivedPos}</td>
                      <td className={`px-4 py-3 text-sm font-semibold ${
                        v.onTimePercent === null ? 'text-on-surface-variant'
                          : v.onTimePercent >= 90 ? 'text-primary' : v.onTimePercent >= 70 ? 'text-secondary' : 'text-error'
                      }`}>
                        {v.onTimePercent === null ? (isAr ? 'لا يوجد' : 'n/a') : `${v.onTimePercent}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
