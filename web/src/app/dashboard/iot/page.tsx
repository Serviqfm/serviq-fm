'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useLanguage } from '@/context/LanguageContext'

// IoT / BMS condition monitoring (MKT-23). Register sensor devices against an asset,
// set an alert band [min, max], and watch the latest pushed reading per device with an
// out-of-threshold flag. Readings arrive via POST /api/v1/sensor-readings (key auth).
// All queries are org-scoped by RLS.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Device = any

const KINDS = ['temperature', 'vibration', 'pressure', 'humidity', 'flow', 'energy', 'other']

// device_id -> latest reading
type Latest = { value: number; reading_at: string }

function isBreached(d: Device, latest?: Latest): boolean {
  if (!latest) return false
  if (d.min_threshold != null && latest.value < Number(d.min_threshold)) return true
  if (d.max_threshold != null && latest.value > Number(d.max_threshold)) return true
  return false
}

export default function IotPage() {
  const [devices, setDevices] = useState<Device[]>([])
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [assets, setAssets] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState<string | null>(null)

  // create-device form
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('temperature')
  const [unit, setUnit] = useState('')
  const [assetId, setAssetId] = useState('')
  const [minT, setMinT] = useState('')
  const [maxT, setMaxT] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const supabase = createClient()
  const { t, lang } = useLanguage()
  const ar = lang === 'ar'

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (profile) setOrgId(profile.organisation_id)
    const [{ data: d }, { data: a }, { data: r }] = await Promise.all([
      supabase.from('sensor_devices').select('*, asset:asset_id(name)').order('created_at', { ascending: false }),
      supabase.from('assets').select('id, name').order('name'),
      // ponytail: pull recent readings and keep the newest per device client-side.
      // One query beats N; bump the limit or add a per-device latest view if reading
      // volume ever outgrows this.
      supabase.from('sensor_readings').select('device_id, value, reading_at').order('reading_at', { ascending: false }).limit(2000),
    ])
    if (d) setDevices(d)
    if (a) setAssets(a)
    if (r) {
      const map: Record<string, Latest> = {}
      for (const row of r) {
        if (!map[row.device_id]) map[row.device_id] = { value: Number(row.value), reading_at: row.reading_at }
      }
      setLatest(map)
    }
    setLoading(false)
  }

  async function createDevice(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || !name.trim()) return
    setSaving(true)
    setErr(null)
    const { error } = await supabase.from('sensor_devices').insert({
      organisation_id: orgId,
      asset_id: assetId || null,
      name: name.trim(),
      kind,
      unit: unit.trim() || null,
      min_threshold: minT === '' ? null : Number(minT),
      max_threshold: maxT === '' ? null : Number(maxT),
    })
    if (error) { setErr(error.message); setSaving(false); return }
    setName(''); setKind('temperature'); setUnit(''); setAssetId(''); setMinT(''); setMaxT(''); setShowCreate(false)
    setSaving(false)
    init()
  }

  async function deleteDevice(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('sensor_devices').delete().eq('id', id)
    setDevices(prev => prev.filter(d => d.id !== id))
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  const alertCount = devices.filter(d => isBreached(d, latest[d.id])).length

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1200px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{ar ? 'مراقبة الاستشعار (IoT)' : 'Condition Monitoring (IoT)'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {ar
                ? 'أجهزة استشعار على الأصول تدفع القراءات؛ راقب أحدث قيمة وتنبيهات تجاوز الحدود'
                : 'Sensors on your assets push readings — watch the latest value and threshold alerts'}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(v => !v)}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 w-fit">
            <span className="material-symbols-outlined text-lg">add</span>
            {ar ? 'جهاز جديد' : 'New Device'}
          </button>
        </div>

        {/* Alert banner */}
        {alertCount > 0 && (
          <div className="flex items-center gap-3 bg-error/5 border border-error/30 rounded-[12px] p-4 text-error">
            <span className="material-symbols-outlined">warning</span>
            <p className="text-sm font-semibold">
              {ar
                ? `${alertCount} جهاز خارج الحدود المسموح بها`
                : `${alertCount} device${alertCount === 1 ? '' : 's'} out of threshold`}
            </p>
          </div>
        )}

        {/* Create form */}
        {showCreate && (
          <form onSubmit={createDevice} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-5 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{ar ? 'الاسم' : 'Name'}</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder={ar ? 'مستشعر حرارة المبرد' : 'Chiller temp sensor'} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{ar ? 'النوع' : 'Kind'}</label>
              <select value={kind} onChange={e => setKind(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm">
                {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{ar ? 'الوحدة' : 'Unit'}</label>
              <input value={unit} onChange={e => setUnit(e.target.value)} placeholder={ar ? '°م' : '°C'} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{ar ? 'الأصل' : 'Asset'}</label>
              <select value={assetId} onChange={e => setAssetId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm">
                <option value="">{ar ? '— لا شيء —' : '— None —'}</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{ar ? 'الحد الأدنى' : 'Min'}</label>
              <input type="number" step="any" value={minT} onChange={e => setMinT(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{ar ? 'الحد الأقصى' : 'Max'}</label>
              <input type="number" step="any" value={maxT} onChange={e => setMaxT(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/50 bg-surface text-on-surface text-sm" />
            </div>
            <div className="flex gap-2 lg:col-span-6">
              <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
                {saving ? t('common.loading') : (ar ? 'حفظ الجهاز' : 'Save Device')}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-5 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.cancel')}</button>
              {err && <span className="text-sm text-error self-center">{err}</span>}
            </div>
          </form>
        )}

        {/* Ingest hint */}
        <div className="text-xs text-on-surface-variant bg-surface-container-lowest border border-outline-variant/50 rounded-lg p-3">
          <span className="font-semibold">{ar ? 'دفع القراءات:' : 'Push readings:'}</span>{' '}
          <code className="text-on-surface">POST /api/v1/sensor-readings</code>{' '}
          <span>{ar ? 'مع مفتاح API و' : 'with your API key and'}</span>{' '}
          <code className="text-on-surface">{'{ "device_id": "…", "value": 42 }'}</code>
        </div>

        {/* Device list */}
        {devices.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">sensors</span>
            <p className="text-lg font-semibold mb-1">{ar ? 'لا توجد أجهزة بعد' : 'No devices yet'}</p>
            <p className="text-sm">{ar ? 'سجّل جهاز استشعار لبدء المراقبة' : 'Register a sensor to start monitoring'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {devices.map(d => {
              const lr = latest[d.id]
              const breached = isBreached(d, lr)
              return (
                <div key={d.id} className={`bg-surface-container-lowest border rounded-[12px] shadow-sm p-4 ${breached ? 'border-error/40' : 'border-outline-variant'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-lg ${breached ? 'bg-error/10' : 'bg-primary/5'}`}>
                        <span className={`material-symbols-outlined ${breached ? 'text-error' : 'text-primary'}`}>sensors</span>
                      </div>
                      <div>
                        <p className="font-semibold text-on-surface leading-tight">{d.name}</p>
                        <p className="text-xs text-on-surface-variant">{d.kind}{d.asset?.name ? ` · ${d.asset.name}` : ''}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteDevice(d.id)} className="text-on-surface-variant hover:text-error transition-colors" title={t('common.delete')}>
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      {lr ? (
                        <>
                          <p className={`text-3xl font-bold ${breached ? 'text-error' : 'text-on-surface'}`}>
                            {Number(lr.value).toLocaleString()}{d.unit ? ` ${d.unit}` : ''}
                          </p>
                          <p className="text-xs text-on-surface-variant mt-0.5">{format(new Date(lr.reading_at), 'dd MMM HH:mm')}</p>
                        </>
                      ) : (
                        <p className="text-sm text-on-surface-variant">{ar ? 'لا توجد قراءات بعد' : 'No readings yet'}</p>
                      )}
                    </div>
                    {breached && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-error bg-error/10 px-2 py-1 rounded-full">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        {ar ? 'خارج الحد' : 'Out of range'}
                      </span>
                    )}
                  </div>

                  {(d.min_threshold != null || d.max_threshold != null) && (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      {ar ? 'الحدود:' : 'Band:'}{' '}
                      {d.min_threshold != null ? Number(d.min_threshold).toLocaleString() : '−∞'}
                      {' … '}
                      {d.max_threshold != null ? Number(d.max_threshold).toLocaleString() : '+∞'}
                      {d.unit ? ` ${d.unit}` : ''}
                    </p>
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
