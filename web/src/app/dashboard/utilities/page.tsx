'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'
import { accountPeriods, type Reading } from '@/lib/utilities'

// FM-28 / MKT-24 — site-level utility billing & energy dashboard. SEPARATE from
// the asset `meters` module: this tracks billed consumption (electricity/water/
// gas) and cost per site. Readings are cumulative; consumption = delta between
// consecutive readings, cost = delta × tariff (all org-scoped by RLS). See
// SQL Files/w6-8-utilities.sql. Consumption math lives in lib/utilities.ts.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Account = any

const money = (n: number) => `SAR ${n.toFixed(2)}`

const TYPES = ['electricity', 'water', 'gas', 'other'] as const
const TYPE_LABEL: Record<string, { en: string; ar: string; icon: string; color: string }> = {
  electricity: { en: 'Electricity', ar: 'كهرباء', icon: 'bolt',          color: '#f57f17' },
  water:       { en: 'Water',       ar: 'مياه',  icon: 'water_drop',     color: '#00677d' },
  gas:         { en: 'Gas',         ar: 'غاز',   icon: 'local_fire_department', color: '#e65100' },
  other:       { en: 'Other',       ar: 'أخرى',  icon: 'category',       color: '#4f5e82' },
}
const DEFAULT_UNIT: Record<string, string> = { electricity: 'kWh', water: 'm³', gas: 'm³', other: 'unit' }

const TOOLTIP_STYLE = { fontFamily: 'DM Sans, sans-serif', fontSize: 12, borderRadius: 8, border: '1px solid #bdc9c3' }
const TICK_STYLE = { fontSize: 11, fontFamily: 'DM Sans, sans-serif', fill: '#3e4944' }

export default function UtilitiesPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [readings, setReadings] = useState<Reading[]>([])
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  // create-account form
  const [showCreate, setShowCreate] = useState(false)
  const [utilityType, setUtilityType] = useState<string>('electricity')
  const [siteId, setSiteId] = useState('')
  const [provider, setProvider] = useState('')
  const [tariff, setTariff] = useState('')
  const [unit, setUnit] = useState('kWh')
  const [saving, setSaving] = useState(false)

  // per-account reading log
  const [openAcct, setOpenAcct] = useState<string | null>(null)
  const [rv, setRv] = useState('')
  const [pStart, setPStart] = useState('')
  const [pEnd, setPEnd] = useState('')
  const [logging, setLogging] = useState(false)

  const supabase = createClient()
  const { t, lang } = useLanguage()
  const canWrite = currentUser && ['admin', 'manager'].includes(currentUser.role)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
    setCurrentUser(profile ?? null)
    if (profile) { setOrgId(profile.organisation_id); await load() }
    setLoading(false)
  }

  async function load() {
    const [{ data: a }, { data: r }, { data: s }] = await Promise.all([
      supabase.from('utility_accounts').select('*, site:site_id(name)').order('created_at', { ascending: false }),
      supabase.from('utility_readings').select('account_id, reading_value, period_start, period_end').order('period_start'),
      supabase.from('sites').select('id, name').order('name'),
    ])
    setAccounts(a ?? [])
    setReadings((r ?? []) as Reading[])
    setSites(s ?? [])
  }

  function pickType(v: string) {
    setUtilityType(v)
    setUnit(DEFAULT_UNIT[v] ?? 'unit')
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true); setErr(null)
    const { error } = await supabase.from('utility_accounts').insert({
      organisation_id: orgId,
      site_id: siteId || null,
      utility_type: utilityType,
      provider: provider.trim() || null,
      tariff_per_unit: Number(tariff) || 0,
      unit: unit.trim() || 'unit',
    })
    if (error) { setErr(error.message); setSaving(false); return }
    setSiteId(''); setProvider(''); setTariff(''); setShowCreate(false)
    setSaving(false)
    load()
  }

  async function logReading(acctId: string) {
    if (!orgId || rv === '' || !pStart || !pEnd) { setErr(lang === 'ar' ? 'أكمل الحقول' : 'Fill in all fields'); return }
    setLogging(true); setErr(null)
    const { error } = await supabase.from('utility_readings').insert({
      organisation_id: orgId,
      account_id: acctId,
      reading_value: Number(rv),
      period_start: pStart,
      period_end: pEnd,
    })
    if (error) { setErr(error.message); setLogging(false); return }
    setRv(''); setPStart(''); setPEnd('')
    setLogging(false)
    await load()
  }

  async function deleteAccount(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    const { error } = await supabase.from('utility_accounts').delete().eq('id', id)
    if (error) { alert(error.message); return }
    if (openAcct === id) setOpenAcct(null)
    load()
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  // ── derive dashboard aggregates from readings + tariffs ──────────────────
  const readingsByAcct: Record<string, Reading[]> = {}
  for (const r of readings) (readingsByAcct[r.account_id] ??= []).push(r)

  const totalsByType: Record<string, number> = {}
  const costByPeriod: Record<string, number> = {}   // period_end → total cost
  for (const acct of accounts) {
    const periods = accountPeriods(readingsByAcct[acct.id] ?? [], Number(acct.tariff_per_unit))
    for (const p of periods) {
      totalsByType[acct.utility_type] = (totalsByType[acct.utility_type] ?? 0) + p.cost
      const key = p.period_end.slice(0, 7)   // YYYY-MM
      costByPeriod[key] = (costByPeriod[key] ?? 0) + p.cost
    }
  }
  const grandTotal = Object.values(totalsByType).reduce((s, n) => s + n, 0)
  const chartData = Object.keys(costByPeriod).sort().map(k => ({ period: k, cost: Number(costByPeriod[k].toFixed(2)) }))

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{lang === 'ar' ? 'المرافق والطاقة' : 'Utilities & Energy'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {lang === 'ar'
                ? 'تتبع استهلاك الكهرباء والمياه والغاز والتكلفة لكل موقع حسب الفترة'
                : 'Track electricity, water & gas consumption and cost per site by period'}
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => setShowCreate(v => !v)}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 w-fit">
              <span className="material-symbols-outlined text-lg">add</span>
              {lang === 'ar' ? 'حساب مرفق جديد' : 'New Account'}
            </button>
          )}
        </div>

        {/* Totals by utility type */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {TYPES.map(ty => {
            const meta = TYPE_LABEL[ty]
            return (
              <div key={ty} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-lg" style={{ color: meta.color }}>{meta.icon}</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{lang === 'ar' ? meta.ar : meta.en}</span>
                </div>
                <p className="text-xl font-bold text-on-surface">{money(totalsByType[ty] ?? 0)}</p>
              </div>
            )
          })}
          <div className="bg-primary/5 border border-primary/20 rounded-[12px] p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-lg text-primary">payments</span>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">{lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
            </div>
            <p className="text-xl font-bold text-primary">{money(grandTotal)}</p>
          </div>
        </div>

        {/* Cost by period chart */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant mb-4">{lang === 'ar' ? 'التكلفة حسب الفترة' : 'Cost by Period'}</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-8 text-center">{lang === 'ar' ? 'سجّل قراءتين على الأقل لعرض الاستهلاك' : 'Log at least two readings to see consumption'}</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} barSize={28}>
                <XAxis dataKey="period" tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => money(Number(v))} />
                <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill="#006b54" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Create form */}
        {showCreate && canWrite && (
          <form onSubmit={createAccount} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'النوع' : 'Type'}</label>
              <select value={utilityType} onChange={e => pickType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm">
                {TYPES.map(ty => <option key={ty} value={ty}>{lang === 'ar' ? TYPE_LABEL[ty].ar : TYPE_LABEL[ty].en}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'الموقع' : 'Site'}</label>
              <select value={siteId} onChange={e => setSiteId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm">
                <option value="">{lang === 'ar' ? '— المؤسسة كلها —' : '— Org-wide —'}</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'المزود' : 'Provider'}</label>
              <input value={provider} onChange={e => setProvider(e.target.value)} placeholder={lang === 'ar' ? 'الشركة السعودية للكهرباء' : 'SEC'} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'التعرفة/الوحدة' : 'Tariff / Unit'}</label>
              <input type="number" step="any" value={tariff} onChange={e => setTariff(e.target.value)} placeholder="0.18" className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'الوحدة' : 'Unit'}</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
            </div>
            <div className="flex gap-2 lg:col-span-5">
              <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
                {saving ? t('common.loading') : (lang === 'ar' ? 'حفظ' : 'Save Account')}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
              {err && <span className="text-sm text-error self-center">{err}</span>}
            </div>
          </form>
        )}

        {/* Account list */}
        {accounts.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">bolt</span>
            <p className="text-lg font-semibold mb-1">{lang === 'ar' ? 'لا توجد حسابات مرافق بعد' : 'No utility accounts yet'}</p>
            <p className="text-sm">{lang === 'ar' ? 'أنشئ حسابًا لبدء تتبع الاستهلاك والتكلفة' : 'Create an account to start tracking consumption and cost'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map(acct => {
              const meta = TYPE_LABEL[acct.utility_type] ?? TYPE_LABEL.other
              const periods = accountPeriods(readingsByAcct[acct.id] ?? [], Number(acct.tariff_per_unit))
              const acctTotal = periods.reduce((s, p) => s + p.cost, 0)
              return (
                <div key={acct.id} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
                  <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-lg" style={{ backgroundColor: meta.color + '14' }}>
                        <span className="material-symbols-outlined" style={{ color: meta.color }}>{meta.icon}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-on-surface">
                          {lang === 'ar' ? meta.ar : meta.en}
                          {acct.provider ? ` · ${acct.provider}` : ''}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          {acct.site?.name ?? (lang === 'ar' ? 'المؤسسة كلها' : 'Org-wide')}
                          {' · '}{money(Number(acct.tariff_per_unit))}/{acct.unit}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-on-surface">{money(acctTotal)}</p>
                      <p className="text-xs text-on-surface-variant uppercase tracking-wider">{lang === 'ar' ? 'التكلفة الإجمالية' : 'Total cost'}</p>
                    </div>
                    <div className="flex gap-2">
                      {canWrite && (
                        <button onClick={() => { setOpenAcct(openAcct === acct.id ? null : acct.id); setErr(null) }} className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors">
                          {openAcct === acct.id ? (lang === 'ar' ? 'إغلاق' : 'Close') : (lang === 'ar' ? 'تسجيل قراءة' : 'Log Reading')}
                        </button>
                      )}
                      {canWrite && (
                        <button onClick={() => deleteAccount(acct.id)} className="px-3 py-1.5 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">{t('common.delete')}</button>
                      )}
                    </div>
                  </div>

                  {openAcct === acct.id && canWrite && (
                    <div className="border-t border-outline-variant/30 p-4 bg-surface-container/30">
                      <div className="flex gap-2 flex-wrap items-end mb-4">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'القراءة' : 'Reading'} ({acct.unit})</label>
                          <input type="number" step="any" value={rv} onChange={e => setRv(e.target.value)} className="px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm w-36" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'من' : 'Period start'}</label>
                          <input type="date" value={pStart} onChange={e => setPStart(e.target.value)} className="px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'إلى' : 'Period end'}</label>
                          <input type="date" value={pEnd} onChange={e => setPEnd(e.target.value)} className="px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
                        </div>
                        <button onClick={() => logReading(acct.id)} disabled={logging} className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
                          {logging ? t('common.loading') : (lang === 'ar' ? 'إضافة' : 'Add')}
                        </button>
                        {err && <span className="text-sm text-error self-center">{err}</span>}
                      </div>

                      {periods.length === 0 ? (
                        <p className="text-sm text-on-surface-variant">{lang === 'ar' ? 'سجّل قراءتين لحساب الاستهلاك' : 'Log two readings to compute consumption'}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                                <th className="py-2 pr-4">{lang === 'ar' ? 'الفترة' : 'Period'}</th>
                                <th className="py-2 pr-4">{lang === 'ar' ? 'الاستهلاك' : 'Consumption'}</th>
                                <th className="py-2">{lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/20">
                              {periods.slice().reverse().map((p, i) => (
                                <tr key={i}>
                                  <td className="py-2 pr-4 text-on-surface-variant whitespace-nowrap">{p.period_start} → {p.period_end}</td>
                                  <td className="py-2 pr-4 font-semibold text-on-surface">{p.consumption.toLocaleString()} {acct.unit}</td>
                                  <td className="py-2 font-semibold text-on-surface">{money(p.cost)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
