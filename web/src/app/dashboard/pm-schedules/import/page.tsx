'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { exportCSV, parseCSV, readFileText } from '@/lib/csv'
import { buildPmScheduleRow, IMPORT_COLUMNS, type ImportContext, type PmScheduleInsert } from '../pm-import'

const SAMPLE_ROWS = [
  { title: 'Monthly AC Filter Cleaning', description: 'Clean/replace filters, check refrigerant', frequency: 'monthly', priority: 'medium', category: 'HVAC', site_name: 'Main Building', asset_name: 'Carrier AC Unit', next_due_at: '2026-08-01', end_date: '', interval_count: '', interval_unit: '', anchor_day: '', estimated_duration_minutes: '60' },
  { title: 'Fire Extinguisher Check', description: 'Inspect expiry + pressure', frequency: 'quarterly', priority: 'high', category: 'Safety', site_name: 'Main Building', asset_name: '', next_due_at: '2026-09-01', end_date: '', interval_count: '', interval_unit: '', anchor_day: '', estimated_duration_minutes: '30' },
]

export default function PMImportPage() {
  const router = useRouter()
  const supabase = createClient()
  const { lang } = useLanguage()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [rowErrors, setRowErrors] = useState<string[]>([])

  function downloadTemplate() {
    exportCSV('pm-schedules-template.csv', SAMPLE_ROWS)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setRowErrors([])
    try {
      const rows = parseCSV(await readFileText(file))
      if (rows.length === 0) { setError(lang === 'ar' ? 'الملف فارغ.' : 'CSV is empty.'); return }
      setPreview(rows)
    } catch (e) {
      setError((lang === 'ar' ? 'تعذر قراءة الملف: ' : 'Could not parse CSV: ') + (e instanceof Error ? e.message : String(e)))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function commit() {
    if (!preview) return
    setImporting(true); setError(''); setRowErrors([])
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError(lang === 'ar' ? 'غير مسجّل الدخول.' : 'Not signed in.'); setImporting(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile?.organisation_id) { setError(lang === 'ar' ? 'لا توجد مؤسسة.' : 'No organisation.'); setImporting(false); return }
    const orgId = profile.organisation_id

    // Resolve site/asset names to ids within the caller's org (RLS already scopes these).
    const [{ data: sites }, { data: assets }] = await Promise.all([
      supabase.from('sites').select('id, name').eq('organisation_id', orgId),
      supabase.from('assets').select('id, name').eq('organisation_id', orgId),
    ])
    const ctx: ImportContext = {
      organisationId: orgId,
      sitesByName: new Map((sites ?? []).map(s => [String(s.name ?? '').toLowerCase(), s.id])),
      assetsByName: new Map((assets ?? []).map(a => [String(a.name ?? '').toLowerCase(), a.id])),
    }

    const payload: PmScheduleInsert[] = []
    const errs: string[] = []
    preview.forEach((raw, i) => {
      const res = buildPmScheduleRow(raw, ctx)
      if ('error' in res) errs.push(`${lang === 'ar' ? 'الصف' : 'Row'} ${i + 2}: ${res.error}`)
      else payload.push(res.row)
    })

    if (payload.length === 0) {
      setError(lang === 'ar' ? 'لا توجد صفوف صالحة للاستيراد.' : 'No valid rows to import.')
      setRowErrors(errs); setImporting(false); return
    }
    const { error: insertErr } = await supabase.from('pm_schedules').insert(payload)
    if (insertErr) { setError((lang === 'ar' ? 'فشل الاستيراد: ' : 'Import failed: ') + insertErr.message); setRowErrors(errs); setImporting(false); return }
    if (errs.length > 0) {
      // Some rows imported, some skipped — show what was skipped before leaving.
      setRowErrors(errs)
      alert(`${payload.length} ${lang === 'ar' ? 'مستورد' : 'imported'}, ${errs.length} ${lang === 'ar' ? 'تم تخطيها' : 'skipped'}.`)
    }
    router.push('/dashboard/pm-schedules')
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link href="/dashboard/pm-schedules" className="text-sm text-on-surface-variant hover:text-primary">← {lang === 'ar' ? 'رجوع إلى جداول الصيانة' : 'Back to PM Schedules'}</Link>
          <h1 className="text-3xl font-bold text-on-surface mt-2">{lang === 'ar' ? 'استيراد جداول الصيانة' : 'Import PM Schedules'}</h1>
          <p className="text-on-surface-variant mt-1 text-sm">{lang === 'ar' ? 'إنشاء عدة جداول صيانة دفعة واحدة من ملف CSV.' : 'Bulk-create PM schedules from a CSV file.'}</p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 space-y-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-2">{lang === 'ar' ? 'الخطوة 1 — نزّل القالب' : 'Step 1 — Download the template'}</div>
            <p className="text-sm text-on-surface-variant mb-3">
              {lang === 'ar'
                ? 'القالب يحتوي الأعمدة المتوقعة مع صفّي مثال. المطلوب: '
                : 'The template has the columns we expect, with two example rows. Required: '}
              <span className="font-semibold text-on-surface">title, frequency, next_due_at</span>.
              {' '}{lang === 'ar' ? 'باقي الأعمدة اختيارية.' : 'Other columns are optional.'}
            </p>
            <button onClick={downloadTemplate}
              className="bg-secondary/10 text-secondary px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-secondary/20 transition-colors">
              <span className="material-symbols-outlined text-base">download</span>{lang === 'ar' ? 'تنزيل قالب CSV' : 'Download template CSV'}
            </button>
          </div>

          <div className="border-t border-outline-variant/40" />

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-2">{lang === 'ar' ? 'الخطوة 2 — ارفع الملف' : 'Step 2 — Upload your filled-in CSV'}</div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            <button onClick={() => fileRef.current?.click()}
              className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-base">upload</span>{lang === 'ar' ? 'اختر ملف CSV' : 'Choose CSV file'}
            </button>
          </div>

          {error && <div className="bg-error/10 border border-error/20 text-error rounded-lg px-3 py-2 text-sm">{error}</div>}
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-2">{lang === 'ar' ? 'الأعمدة المتوقعة' : 'Expected columns'}</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-on-surface-variant">
            {IMPORT_COLUMNS.map(c => (
              <code key={c} className="bg-surface-container-low rounded px-2 py-1 font-mono">{c}</code>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant mt-3">
            {lang === 'ar'
              ? 'frequency: daily/weekly/fortnightly/monthly/quarterly/biannual/annual · priority: low/medium/high/critical · التواريخ: YYYY-MM-DD · site_name/asset_name يجب أن تطابق الأسماء في التطبيق.'
              : 'frequency: daily/weekly/fortnightly/monthly/quarterly/biannual/annual · priority: low/medium/high/critical · dates: YYYY-MM-DD · site_name/asset_name must match names as they appear in the app.'}
          </p>
        </div>

        {rowErrors.length > 0 && (
          <div className="bg-error/10 border border-error/20 rounded-[12px] p-4">
            <p className="text-sm font-semibold text-error mb-2">{lang === 'ar' ? 'صفوف تم تخطيها:' : 'Skipped rows:'}</p>
            {rowErrors.map((e, i) => <p key={i} className="text-xs text-error/90 mb-1">{e}</p>)}
          </div>
        )}

        {preview && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden">
            <div className="px-4 py-3 border-b border-outline-variant flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-on-surface">{lang === 'ar' ? 'معاينة' : 'Preview'} — {preview.length} {lang === 'ar' ? 'صف' : (preview.length === 1 ? 'row' : 'rows')}</div>
                <div className="text-xs text-on-surface-variant mt-0.5">{lang === 'ar' ? 'أول 10 صفوف. اضغط استيراد للتأكيد.' : 'Showing first 10 rows. Click Import to commit.'}</div>
              </div>
              <button onClick={commit} disabled={importing}
                className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
                {importing ? (lang === 'ar' ? 'جارٍ الاستيراد…' : 'Importing…') : `${lang === 'ar' ? 'استيراد' : 'Import'} ${preview.length}`}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-container-low">
                  <tr>
                    {IMPORT_COLUMNS.map(c => (
                      <th key={c} className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-secondary whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/40">
                  {preview.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      {IMPORT_COLUMNS.map(c => (
                        <td key={c} className="px-3 py-2 whitespace-nowrap">{r[c] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
