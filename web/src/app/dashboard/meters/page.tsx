'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useLanguage } from '@/context/LanguageContext'

// Meters foundation (T8 / 1C-11 / MKT-04): register meters against an asset and
// log readings into the append-only ledger. Each reading insert also bumps the
// meter's cached current_reading — that cached value is what the nightly hybrid PM
// trigger (generate_due_pm_work_orders) reads. All queries are org-scoped by RLS.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Meter = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Reading = any

const UNITS = ['hours', 'km', 'miles', 'cycles', 'kWh', 'L', 'm³']

export default function MetersPage() {
  const [meters, setMeters] = useState<Meter[]>([])
  const [assets, setAssets] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // create-meter form
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('hours')
  const [assetId, setAssetId] = useState('')
  const [start, setStart] = useState('0')
  const [saving, setSaving] = useState(false)

  // per-meter reading log
  const [openMeter, setOpenMeter] = useState<string | null>(null)
  const [readings, setReadings] = useState<Reading[]>([])
  const [readingVal, setReadingVal] = useState('')
  const [readingNote, setReadingNote] = useState('')
  const [logging, setLogging] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const supabase = createClient()
  const { t, lang } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (profile) setOrgId(profile.organisation_id)
    const [{ data: m }, { data: a }] = await Promise.all([
      supabase.from('meters').select('*, asset:asset_id(name)').order('created_at', { ascending: false }),
      supabase.from('assets').select('id, name').order('name'),
    ])
    if (m) setMeters(m)
    if (a) setAssets(a)
    setLoading(false)
  }

  async function createMeter(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !name.trim()) return
    setSaving(true)
    setErr(null)
    const startNum = Number(start) || 0
    const { error } = await supabase.from('meters').insert({
      organisation_id: orgId,
      asset_id: assetId || null,
      name: name.trim(),
      unit,
      current_reading: startNum,
      created_by: userId,
    })
    if (error) { setErr(error.message); setSaving(false); return }
    setName(''); setUnit('hours'); setAssetId(''); setStart('0'); setShowCreate(false)
    setSaving(false)
    init()
  }

  async function openLog(meterId: string) {
    if (openMeter === meterId) { setOpenMeter(null); return }
    setOpenMeter(meterId)
    setReadingVal(''); setReadingNote(''); setErr(null)
    const { data } = await supabase
      .from('meter_readings')
      .select('*, reader:read_by(full_name)')
      .eq('meter_id', meterId)
      .order('read_at', { ascending: false })
      .limit(20)
    setReadings(data ?? [])
  }

  async function logReading(meter: Meter) {
    const val = Number(readingVal)
    if (!orgId || readingVal === '' || Number.isNaN(val)) { setErr(lang === 'ar' ? 'أدخل قيمة صحيحة' : 'Enter a valid number'); return }
    if (val < Number(meter.current_reading)) {
      setErr(lang === 'ar' ? 'القراءة أقل من القراءة الحالية' : 'Reading is below the current reading')
      return
    }
    setLogging(true)
    setErr(null)
    // Ledger insert + cached current_reading bump. Two writes, not one transaction —
    // ponytail: a stray failed second write only makes the cached value trail the
    // ledger; the nightly trigger self-heals on the next real reading. Wrap in an RPC
    // if a hard invariant is ever required.
    const { error: insErr } = await supabase.from('meter_readings').insert({
      organisation_id: orgId,
      meter_id: meter.id,
      reading: val,
      note: readingNote.trim() || null,
      read_by: userId,
    })
    if (insErr) { setErr(insErr.message); setLogging(false); return }
    await supabase.from('meters').update({ current_reading: val, updated_at: new Date().toISOString() }).eq('id', meter.id)
    setReadingVal(''); setReadingNote('')
    setLogging(false)
    await openLog(meter.id) // reload history
    // refresh cached reading in the list
    setMeters(prev => prev.map(m => m.id === meter.id ? { ...m, current_reading: val } : m))
  }

  async function deleteMeter(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('meters').delete().eq('id', id)
    if (openMeter === id) setOpenMeter(null)
    setMeters(prev => prev.filter(m => m.id !== id))
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{lang === 'ar' ? 'العدادات' : 'Meters'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {lang === 'ar'
                ? 'تتبع ساعات التشغيل والمسافة والدورات لتشغيل الصيانة الوقائية القائمة على الاستخدام'
                : 'Track runtime hours, distance, and cycles to drive usage-based preventive maintenance'}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 w-fit">
            <span className="material-symbols-outlined text-lg">add</span>
            {lang === 'ar' ? 'عداد جديد' : 'New Meter'}
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <form onSubmit={createMeter} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'الاسم' : 'Name'}</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder={lang === 'ar' ? 'عداد ساعات المولد' : 'Generator runtime'} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'الوحدة' : 'Unit'}</label>
              <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'الأصل' : 'Asset'}</label>
              <select value={assetId} onChange={e => setAssetId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm">
                <option value="">{lang === 'ar' ? '— لا شيء —' : '— None —'}</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'القراءة الأولية' : 'Start Reading'}</label>
              <input type="number" step="any" value={start} onChange={e => setStart(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
            </div>
            <div className="flex gap-2 lg:col-span-5">
              <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
                {saving ? t('common.loading') : (lang === 'ar' ? 'حفظ' : 'Save Meter')}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
              {err && <span className="text-sm text-error self-center">{err}</span>}
            </div>
          </form>
        )}

        {/* Meter list */}
        {meters.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">speed</span>
            <p className="text-lg font-semibold mb-1">{lang === 'ar' ? 'لا توجد عدادات بعد' : 'No meters yet'}</p>
            <p className="text-sm">{lang === 'ar' ? 'أنشئ عدادًا لبدء تتبع الاستخدام' : 'Create a meter to start tracking usage'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {meters.map(m => (
              <div key={m.id} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
                <div className="p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-lg bg-primary/5"><span className="material-symbols-outlined text-primary">speed</span></div>
                    <div>
                      <p className="font-semibold text-on-surface">{m.name}</p>
                      <p className="text-xs text-on-surface-variant">{m.asset?.name ?? (lang === 'ar' ? 'غير مرتبط بأصل' : 'No asset')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{Number(m.current_reading).toLocaleString()}</p>
                    <p className="text-xs text-on-surface-variant uppercase tracking-wider">{m.unit}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => openLog(m.id)} className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors">
                      {openMeter === m.id ? (lang === 'ar' ? 'إغلاق' : 'Close') : (lang === 'ar' ? 'تسجيل قراءة' : 'Log Reading')}
                    </button>
                    <button onClick={() => deleteMeter(m.id)} className="px-3 py-1.5 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">{t('common.delete')}</button>
                  </div>
                </div>

                {openMeter === m.id && (
                  <div className="border-t border-outline-variant/30 p-4 bg-surface-container/30">
                    <div className="flex gap-2 flex-wrap items-end mb-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'قراءة جديدة' : 'New Reading'} ({m.unit})</label>
                        <input type="number" step="any" value={readingVal} onChange={e => setReadingVal(e.target.value)} className="px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm w-40" />
                      </div>
                      <div className="flex-1 min-w-[160px]">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{lang === 'ar' ? 'ملاحظة' : 'Note'}</label>
                        <input value={readingNote} onChange={e => setReadingNote(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
                      </div>
                      <button onClick={() => logReading(m)} disabled={logging} className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
                        {logging ? t('common.loading') : (lang === 'ar' ? 'إضافة' : 'Add')}
                      </button>
                      {err && <span className="text-sm text-error self-center">{err}</span>}
                    </div>

                    {readings.length === 0 ? (
                      <p className="text-sm text-on-surface-variant">{lang === 'ar' ? 'لا توجد قراءات بعد' : 'No readings yet'}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                              <th className="py-2 pr-4">{lang === 'ar' ? 'القراءة' : 'Reading'}</th>
                              <th className="py-2 pr-4">{lang === 'ar' ? 'التاريخ' : 'When'}</th>
                              <th className="py-2 pr-4">{lang === 'ar' ? 'بواسطة' : 'By'}</th>
                              <th className="py-2">{lang === 'ar' ? 'ملاحظة' : 'Note'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/20">
                            {readings.map(r => (
                              <tr key={r.id}>
                                <td className="py-2 pr-4 font-semibold text-on-surface">{Number(r.reading).toLocaleString()} {m.unit}</td>
                                <td className="py-2 pr-4 text-on-surface-variant whitespace-nowrap">{format(new Date(r.read_at), 'dd MMM yyyy HH:mm')}</td>
                                <td className="py-2 pr-4 text-on-surface-variant">{r.reader?.full_name ?? '—'}</td>
                                <td className="py-2 text-on-surface-variant">{r.note ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
