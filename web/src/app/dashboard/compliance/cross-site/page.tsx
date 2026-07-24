'use client'

// CORE-29 — Cross-site inspection compliance comparison (read-only, MVP).
// Reads inspection_results (org-scoped by RLS) and computes, per site, the
// inspection pass rate = completed inspections that passed / completed
// inspections. Renders a comparison grid + bar per site, and an optional
// per-space breakdown when a site is selected. Admin/manager only. No new table.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

// A completed inspection is "compliant" when it passed. partial/fail are not.
// ponytail: pass-rate is the MVP metric; "on-time vs schedule" is a follow-up.
function isCompliant(r: Row): boolean {
  return String(r.overall_result).toLowerCase() === 'pass'
}
function isCompleted(r: Row): boolean {
  return String(r.status).toLowerCase() === 'completed'
}

type Agg = { key: string; name: string; total: number; passed: number; pct: number | null }

function aggregate(rows: Row[], keyOf: (r: Row) => string, nameOf: (r: Row) => string): Agg[] {
  const map = new Map<string, Agg>()
  for (const r of rows) {
    if (!isCompleted(r)) continue
    const key = keyOf(r)
    if (!key) continue
    let a = map.get(key)
    if (!a) { a = { key, name: nameOf(r) || '—', total: 0, passed: 0, pct: null }; map.set(key, a) }
    a.total++
    if (isCompliant(r)) a.passed++
  }
  const out = Array.from(map.values())
  for (const a of out) a.pct = a.total > 0 ? Math.round((a.passed / a.total) * 100) : null
  // Worst compliance first — that's what a manager wants to see.
  out.sort((x, y) => (x.pct ?? 999) - (y.pct ?? 999))
  return out
}

const pctColor = (p: number | null) =>
  p == null ? 'text-on-surface-variant' : p >= 80 ? 'text-secondary' : p >= 50 ? 'text-[#f57f17]' : 'text-error'
const barColor = (p: number | null) =>
  p == null ? 'bg-outline-variant' : p >= 80 ? 'bg-secondary' : p >= 50 ? 'bg-[#f57f17]' : 'bg-error'

export default function CrossSiteCompliancePage() {
  const supabase = createClient()
  const { lang } = useLanguage()
  const ar = lang === 'ar'

  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [selectedSite, setSelectedSite] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile || !['admin', 'manager'].includes(profile.role)) { setAllowed(false); setLoading(false); return }
    setAllowed(true)
    const { data } = await supabase.from('inspection_results')
      .select('id, status, overall_result, site_id, space_id, site:site_id(name), space:space_id(name)')
      .eq('organisation_id', profile.organisation_id)
    if (data) setRows(data)
    setLoading(false)
  }

  const bySite = useMemo(
    () => aggregate(rows, r => r.site_id, r => r.site?.name),
    [rows]
  )

  const bySpace = useMemo(() => {
    if (!selectedSite) return []
    return aggregate(rows.filter(r => r.site_id === selectedSite), r => r.space_id, r => r.space?.name)
  }, [rows, selectedSite])

  const overall = useMemo(() => {
    let total = 0, passed = 0
    for (const a of bySite) { total += a.total; passed += a.passed }
    return { sites: bySite.length, total, passed, pct: total > 0 ? Math.round((passed / total) * 100) : null }
  }, [bySite])

  const belowTarget = bySite.filter(a => a.pct != null && a.pct < 80).length

  if (loading) return <div className="p-8 text-on-surface-variant">{ar ? 'جارٍ التحميل...' : 'Loading...'}</div>
  if (allowed === false) return (
    <div className="p-8 text-on-surface-variant">
      {ar ? 'ليس لديك صلاحية الوصول إلى هذه الصفحة.' : 'You do not have permission to access this page.'}
    </div>
  )

  const selectedName = bySite.find(a => a.key === selectedSite)?.name ?? ''

  const cards = [
    { label: ar ? 'المواقع المُفتّشة' : 'Sites Inspected', value: overall.sites, cls: 'text-on-surface' },
    { label: ar ? 'إجمالي عمليات التفتيش' : 'Completed Inspections', value: overall.total, cls: 'text-primary' },
    { label: ar ? 'الامتثال الإجمالي' : 'Overall Compliance', value: overall.pct == null ? '—' : overall.pct + '%', cls: pctColor(overall.pct) },
    { label: ar ? 'مواقع دون الهدف (<80%)' : 'Sites Below Target (<80%)', value: belowTarget, cls: belowTarget > 0 ? 'text-error' : 'text-secondary' },
  ]

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={ar ? 'rtl' : 'ltr'}>
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-on-surface m-0">{ar ? 'مقارنة الامتثال بين المواقع' : 'Cross-Site Compliance'}</h1>
            <p className="text-sm text-on-surface-variant mt-1 mb-0">{ar ? 'نسبة نجاح عمليات التفتيش المكتملة لكل موقع' : 'Inspection pass rate by site (completed inspections)'}</p>
          </div>
          <Link href="/dashboard/inspections">
            <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">{ar ? 'عمليات التفتيش' : 'Inspections'}</button>
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map(c => (
            <div key={c.label} className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 shadow-sm">
              <p className="text-xs text-on-surface-variant mb-2 font-medium">{c.label}</p>
              <p className={`text-[28px] font-bold m-0 ${c.cls}`}>{c.value}</p>
            </div>
          ))}
        </div>

        {bySite.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">fact_check</span>
            <p className="text-lg font-semibold mb-1">{ar ? 'لا توجد بيانات تفتيش مكتملة' : 'No completed inspections yet'}</p>
            <p className="text-sm">{ar ? 'ستظهر المقارنة بمجرد اكتمال عمليات التفتيش عبر المواقع.' : 'The comparison appears once inspections are completed across sites.'}</p>
          </div>
        ) : (
          <>
            {/* Comparison bars */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant m-0">{ar ? 'الامتثال حسب الموقع' : 'Compliance by Site'}</h2>
              {bySite.map(a => (
                <button key={a.key} onClick={() => setSelectedSite(selectedSite === a.key ? null : a.key)}
                  className={`w-full text-start flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${selectedSite === a.key ? 'bg-primary/5' : 'hover:bg-surface-container-low'}`}>
                  <span className="w-40 shrink-0 text-sm text-on-surface truncate">{a.name}</span>
                  <div className="flex-1 bg-outline-variant/30 rounded-full h-2.5 min-w-[80px]">
                    <div className={`${barColor(a.pct)} rounded-full h-2.5`} style={{ width: (a.pct ?? 0) + '%' }} />
                  </div>
                  <span className={`w-12 shrink-0 text-sm font-semibold text-end ${pctColor(a.pct)}`}>{a.pct == null ? '—' : a.pct + '%'}</span>
                  <span className="w-24 shrink-0 text-xs text-on-surface-variant text-end">{a.passed}/{a.total} {ar ? 'ناجح' : 'pass'}</span>
                </button>
              ))}
            </div>

            {/* Per-space breakdown for the selected site */}
            {selectedSite && (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/30">
                  <h2 className="text-sm font-semibold text-on-surface m-0">{ar ? 'التفصيل حسب المساحة' : 'Breakdown by Space'} · {selectedName}</h2>
                  <button onClick={() => setSelectedSite(null)} className="text-xs text-on-surface-variant hover:text-on-surface">{ar ? 'إغلاق' : 'Close'}</button>
                </div>
                {bySpace.length === 0 ? (
                  <p className="text-sm text-on-surface-variant text-center py-8">{ar ? 'لا توجد عمليات تفتيش مرتبطة بمساحة لهذا الموقع.' : 'No space-tagged inspections for this site.'}</p>
                ) : (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant">
                        {[ar ? 'المساحة' : 'Space', ar ? 'مكتمل' : 'Completed', ar ? 'ناجح' : 'Passed', ar ? 'الامتثال' : 'Compliance'].map(h => (
                          <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant ${ar ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bySpace.map(s => (
                        <tr key={s.key} className="hover:bg-surface-container-low transition-colors border-b border-outline-variant/20">
                          <td className="px-4 py-3 text-sm text-on-surface">{s.name}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-on-surface">{s.total}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-primary">{s.passed}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-outline-variant/30 rounded-full h-2 min-w-[60px]">
                                <div className={`${barColor(s.pct)} rounded-full h-2`} style={{ width: (s.pct ?? 0) + '%' }} />
                              </div>
                              <span className={`text-sm font-semibold ${pctColor(s.pct)}`}>{s.pct == null ? '—' : s.pct + '%'}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
