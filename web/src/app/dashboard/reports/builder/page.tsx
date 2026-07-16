'use client'

// MKT-08 / FM-11 — Real report builder + scheduled report packs.
// Pick an entity (WO / asset / PM) + columns + date range + filters, preview a
// live org-scoped table, and export CSV or print. Admins can also save a
// scheduled report pack that /api/cron/scheduled-reports emails on a cadence.
// Reuses lib/csv (exportCSV) for export; no server route needed for the preview.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { exportCSV } from '@/lib/csv'

type EntityKey = 'work_orders' | 'assets' | 'pm_schedules'

interface ColumnDef { key: string; label: string; labelAr: string }
interface EntityDef {
  table: string
  label: string
  labelAr: string
  dateField: string          // column the date-range filter applies to
  columns: ColumnDef[]
  statusValues?: string[]     // optional status filter dropdown
}

// Column sets deliberately mirror the fields the reports/standard PDF route
// already reads, so the builder stays consistent with the existing report pack.
const ENTITIES: Record<EntityKey, EntityDef> = {
  work_orders: {
    table: 'work_orders',
    label: 'Work Orders',
    labelAr: 'أوامر العمل',
    dateField: 'created_at',
    statusValues: ['new', 'assigned', 'in_progress', 'on_hold', 'completed', 'closed'],
    columns: [
      { key: 'wo_number', label: 'WO #', labelAr: 'رقم الأمر' },
      { key: 'title', label: 'Title', labelAr: 'العنوان' },
      { key: 'status', label: 'Status', labelAr: 'الحالة' },
      { key: 'priority', label: 'Priority', labelAr: 'الأولوية' },
      { key: 'created_at', label: 'Opened', labelAr: 'تاريخ الفتح' },
      { key: 'due_at', label: 'Due', labelAr: 'الاستحقاق' },
      { key: 'completed_at', label: 'Completed', labelAr: 'الإكمال' },
      { key: 'actual_cost', label: 'Cost', labelAr: 'التكلفة' },
    ],
  },
  assets: {
    table: 'assets',
    label: 'Assets',
    labelAr: 'الأصول',
    dateField: 'created_at',
    statusValues: ['operational', 'under_maintenance', 'decommissioned'],
    columns: [
      { key: 'name', label: 'Name', labelAr: 'الاسم' },
      { key: 'category', label: 'Category', labelAr: 'الفئة' },
      { key: 'status', label: 'Status', labelAr: 'الحالة' },
      { key: 'criticality', label: 'Criticality', labelAr: 'الأهمية' },
      { key: 'purchase_date', label: 'Purchased', labelAr: 'تاريخ الشراء' },
      { key: 'created_at', label: 'Added', labelAr: 'أضيف' },
    ],
  },
  pm_schedules: {
    table: 'pm_schedules',
    label: 'PM Schedules',
    labelAr: 'جداول الصيانة الوقائية',
    dateField: 'created_at',
    columns: [
      { key: 'title', label: 'Title', labelAr: 'العنوان' },
      { key: 'frequency', label: 'Frequency', labelAr: 'التكرار' },
      { key: 'is_active', label: 'Active', labelAr: 'نشط' },
      { key: 'next_due_at', label: 'Next Due', labelAr: 'الاستحقاق التالي' },
      { key: 'created_at', label: 'Created', labelAr: 'أُنشئ' },
    ],
  },
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-GB')
  }
  return String(v)
}

export default function ReportBuilderPage() {
  const { lang } = useLanguage()
  const supabase = createClient()

  const [orgId, setOrgId] = useState<string | null>(null)
  const [canSchedule, setCanSchedule] = useState(false)
  const [entity, setEntity] = useState<EntityKey>('work_orders')
  const [selectedCols, setSelectedCols] = useState<string[]>(ENTITIES.work_orders.columns.map(c => c.key))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
      if (profile) {
        setOrgId(profile.organisation_id)
        setCanSchedule(['admin', 'manager'].includes(profile.role))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset column selection when the entity changes.
  function pickEntity(k: EntityKey) {
    setEntity(k)
    setSelectedCols(ENTITIES[k].columns.map(c => c.key))
    setStatus('')
    setRows([])
  }

  function toggleCol(key: string) {
    setSelectedCols(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key])
  }

  const def = ENTITIES[entity]
  const orderedCols = def.columns.filter(c => selectedCols.includes(c.key))

  async function runReport() {
    if (!orgId) return
    if (orderedCols.length === 0) { setError(lang === 'ar' ? 'اختر عمودًا واحدًا على الأقل' : 'Pick at least one column.'); return }
    setRunning(true); setError(null)
    // Always fetch the date field so range filtering is honoured even if unselected.
    const fetchCols = Array.from(new Set([def.dateField, 'status', ...selectedCols])).join(', ')
    let q = supabase.from(def.table).select(fetchCols).eq('organisation_id', orgId).limit(1000)
    if (from) q = q.gte(def.dateField, from)
    if (to) q = q.lte(def.dateField, to + 'T23:59:59')
    if (status && def.statusValues) q = q.eq('status', status)
    q = q.order(def.dateField, { ascending: false })
    const { data, error: qErr } = await q
    if (qErr) { setError(qErr.message); setRows([]); setRunning(false); return }
    setRows((data as unknown as Record<string, unknown>[]) ?? [])
    setRunning(false)
  }

  function doExportCSV() {
    if (rows.length === 0) return
    const out = rows.map(r => {
      const o: Record<string, unknown> = {}
      for (const c of orderedCols) o[lang === 'ar' ? c.labelAr : c.label] = fmt(r[c.key])
      return o
    })
    exportCSV(`${entity}-${new Date().toISOString().slice(0, 10)}.csv`, out)
  }

  async function saveSchedule() {
    if (!orgId) return
    const name = window.prompt(lang === 'ar' ? 'اسم التقرير المجدول:' : 'Name for this scheduled report:')
    if (!name) return
    const recipientsRaw = window.prompt(lang === 'ar' ? 'المستلمون (بريد إلكتروني مفصول بفاصلة):' : 'Recipients (comma-separated emails):')
    if (!recipientsRaw) return
    const recipients = recipientsRaw.split(',').map(s => s.trim()).filter(Boolean)
    const freq = window.confirm(lang === 'ar' ? 'شهري؟ (إلغاء = أسبوعي)' : 'Monthly? (Cancel = weekly)') ? 'monthly' : 'weekly'
    // First run: next occurrence. Monthly = 1st of next month; weekly = +7 days.
    const now = new Date()
    const next = freq === 'monthly'
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      : new Date(now.getTime() + 7 * 86_400_000)
    const config = { entity, columns: selectedCols, from, to, status }
    // Table may not exist yet (app must build/run without the migration). Swallow
    // a missing-relation error into a friendly message rather than throwing.
    const { error: insErr } = await supabase.from('scheduled_reports').insert({
      organisation_id: orgId,
      name,
      config,
      recipients,
      frequency: freq,
      next_run_at: next.toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    if (insErr) {
      setSaveMsg((lang === 'ar' ? 'تعذر الحفظ: ' : 'Could not save: ') + insErr.message)
    } else {
      setSaveMsg(lang === 'ar' ? 'تم حفظ التقرير المجدول.' : 'Scheduled report saved.')
    }
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{lang === 'ar' ? 'منشئ التقارير' : 'Report Builder'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{lang === 'ar' ? 'اختر الكيان والأعمدة والنطاق ثم صدّر أو اطبع.' : 'Pick an entity, columns and a date range, then preview, export or schedule.'}</p>
          </div>
          <a href="/dashboard/reports" className="text-sm font-semibold text-primary hover:underline self-start sm:self-auto flex items-center gap-1">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            {lang === 'ar' ? 'التقارير' : 'Reports & Analytics'}
          </a>
        </div>

        {/* Builder controls */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 shadow-sm space-y-5 print:hidden">
          {/* Entity */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">{lang === 'ar' ? 'الكيان' : 'Entity'}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ENTITIES) as EntityKey[]).map(k => (
                <button key={k} onClick={() => pickEntity(k)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${entity === k ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}`}>
                  {lang === 'ar' ? ENTITIES[k].labelAr : ENTITIES[k].label}
                </button>
              ))}
            </div>
          </div>

          {/* Columns */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">{lang === 'ar' ? 'الأعمدة' : 'Columns'}</p>
            <div className="flex flex-wrap gap-2">
              {def.columns.map(c => (
                <label key={c.key} className={`px-3 py-1.5 rounded-lg text-sm cursor-pointer select-none border transition-colors ${selectedCols.includes(c.key) ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-surface-container-high border-transparent text-on-surface-variant'}`}>
                  <input type="checkbox" className="sr-only" checked={selectedCols.includes(c.key)} onChange={() => toggleCol(c.key)} />
                  {lang === 'ar' ? c.labelAr : c.label}
                </label>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1 block">{lang === 'ar' ? 'من' : 'From'}</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm text-on-surface" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1 block">{lang === 'ar' ? 'إلى' : 'To'}</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm text-on-surface" />
            </div>
            {def.statusValues && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1 block">{lang === 'ar' ? 'الحالة' : 'Status'}</label>
                <select value={status} onChange={e => setStatus(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm text-on-surface">
                  <option value="">{lang === 'ar' ? 'الكل' : 'All'}</option>
                  {def.statusValues.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-1">
            <button onClick={runReport} disabled={running} className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50">
              <span className="material-symbols-outlined text-lg">play_arrow</span>
              {running ? (lang === 'ar' ? 'جارٍ...' : 'Running…') : (lang === 'ar' ? 'تشغيل' : 'Run Report')}
            </button>
            <button onClick={doExportCSV} disabled={rows.length === 0} className="bg-secondary text-on-secondary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-secondary/90 transition-colors shadow-sm disabled:opacity-50">
              <span className="material-symbols-outlined text-lg">download</span>
              {lang === 'ar' ? 'تصدير CSV' : 'Export CSV'}
            </button>
            <button onClick={() => window.print()} disabled={rows.length === 0} className="bg-surface-container-high text-on-surface-variant px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-highest transition-colors disabled:opacity-50">
              <span className="material-symbols-outlined text-lg">print</span>
              {lang === 'ar' ? 'طباعة' : 'Print'}
            </button>
            {canSchedule && (
              <button onClick={saveSchedule} className="bg-surface-container-high text-on-surface-variant px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-highest transition-colors">
                <span className="material-symbols-outlined text-lg">calendar_today</span>
                {lang === 'ar' ? 'جدولة' : 'Schedule'}
              </button>
            )}
          </div>
          {error && <p className="text-sm text-[#ba1a1a]">{error}</p>}
          {saveMsg && <p className="text-sm text-primary">{saveMsg}</p>}
        </div>

        {/* Preview table */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-6 shadow-sm overflow-x-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-on-surface">{lang === 'ar' ? 'المعاينة' : 'Preview'}</h2>
            <span className="text-sm text-on-surface-variant">{rows.length} {lang === 'ar' ? 'صف' : 'rows'}</span>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-8 text-center">{lang === 'ar' ? 'شغّل تقريرًا لرؤية النتائج.' : 'Run a report to see results.'}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/50">
                  {orderedCols.map(c => (
                    <th key={c.key} className="text-left py-2 px-3 font-semibold text-on-surface-variant uppercase text-xs tracking-wider">{lang === 'ar' ? c.labelAr : c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-outline-variant/20">
                    {orderedCols.map(c => (
                      <td key={c.key} className="py-2 px-3 text-on-surface">{fmt(r[c.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
