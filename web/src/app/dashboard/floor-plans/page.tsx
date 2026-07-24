'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

// AL-17 — Floor plans with mapping pins (MVP).
// Upload a floor-plan image (media bucket), place pins by clicking the image
// (x/y stored as % of image), link each pin to a space or asset, view pins.

type Plan = { id: string; name: string; site_id: string; image_url: string | null }
type Pin = { id: string; floor_plan_id: string; space_id: string | null; asset_id: string | null; label: string | null; x: number; y: number }

export default function FloorPlansPage() {
  const supabase = createClient()
  const { lang } = useLanguage()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [sites, setSites] = useState<{ id: string; name: string }[]>([])
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([])
  const [assets, setAssets] = useState<{ id: string; name: string }[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pins, setPins] = useState<Pin[]>([])
  const [loading, setLoading] = useState(true)

  // create-plan form
  const [newName, setNewName] = useState('')
  const [newSite, setNewSite] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // pin placement
  const [addMode, setAddMode] = useState(false)
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null)
  const [pinLabel, setPinLabel] = useState('')
  const [pinSpace, setPinSpace] = useState('')
  const [pinAsset, setPinAsset] = useState('')
  const [openPin, setOpenPin] = useState<string | null>(null)

  const canWrite = currentUser && ['admin', 'manager'].includes(currentUser.role)
  const selected = plans.find(p => p.id === selectedId) || null
  const T = (en: string, ar: string) => (lang === 'ar' ? ar : en)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
      const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
      setCurrentUser(profile ?? null)
      if (profile?.organisation_id) { setOrgId(profile.organisation_id); await loadAll(profile.organisation_id) }
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAll(org: string) {
    const [{ data: st }, { data: sp }, { data: as }, { data: pl }] = await Promise.all([
      supabase.from('sites').select('id, name').eq('organisation_id', org).order('name'),
      supabase.from('spaces').select('id, name').eq('organisation_id', org).order('name'),
      supabase.from('assets').select('id, name').eq('organisation_id', org).order('name'),
      supabase.from('floor_plans').select('id, name, site_id, image_url').eq('organisation_id', org).order('created_at', { ascending: false }),
    ])
    setSites(st ?? [])
    setSpaces(sp ?? [])
    setAssets(as ?? [])
    setPlans((pl ?? []) as Plan[])
    if (!selectedId && pl && pl.length) selectPlan(pl[0].id)
  }

  async function selectPlan(id: string) {
    setSelectedId(id)
    setAddMode(false); setPending(null); setOpenPin(null)
    const { data } = await supabase.from('floor_plan_pins')
      .select('id, floor_plan_id, space_id, asset_id, label, x, y').eq('floor_plan_id', id)
    setPins((data ?? []) as Pin[])
  }

  async function createPlan(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setError(''); setUploading(true)
    try {
      const file = fileRef.current?.files?.[0]
      let imageUrl: string | null = null
      if (file) {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase()
        const path = `floor-plans/${orgId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('media').upload(path, file, { cacheControl: '3600', upsert: true })
        if (upErr) { setError(upErr.message); return }
        imageUrl = supabase.storage.from('media').getPublicUrl(path).data.publicUrl
      }
      const { data, error: insErr } = await supabase.from('floor_plans')
        .insert({ organisation_id: orgId, site_id: newSite, name: newName, image_url: imageUrl })
        .select('id, name, site_id, image_url').single()
      if (insErr) { setError(insErr.message); return }
      setPlans(prev => [data as Plan, ...prev])
      setNewName(''); setNewSite(''); if (fileRef.current) fileRef.current.value = ''
      selectPlan((data as Plan).id)
    } finally {
      setUploading(false)
    }
  }

  async function deletePlan(id: string) {
    if (!confirm(T('Delete this floor plan and its pins?', 'حذف هذا المخطط ودبابيسه؟'))) return
    await supabase.from('floor_plans').delete().eq('id', id)
    setPlans(prev => prev.filter(p => p.id !== id))
    if (selectedId === id) { setSelectedId(null); setPins([]) }
  }

  function onImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!addMode || !canWrite) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setPending({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })
    setPinLabel(''); setPinSpace(''); setPinAsset('')
  }

  async function savePin() {
    if (!orgId || !selectedId || !pending) return
    setError('')
    const { data, error: insErr } = await supabase.from('floor_plan_pins').insert({
      organisation_id: orgId,
      floor_plan_id: selectedId,
      space_id: pinSpace || null,
      asset_id: pinAsset || null,
      label: pinLabel || null,
      x: pending.x, y: pending.y,
    }).select('id, floor_plan_id, space_id, asset_id, label, x, y').single()
    if (insErr) { setError(insErr.message); return }
    setPins(prev => [...prev, data as Pin])
    setPending(null); setAddMode(false)
  }

  async function deletePin(id: string) {
    await supabase.from('floor_plan_pins').delete().eq('id', id)
    setPins(prev => prev.filter(p => p.id !== id))
    setOpenPin(null)
  }

  const inputCls = "w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
  const pinLabelText = (p: Pin) => p.label || spaces.find(s => s.id === p.space_id)?.name || assets.find(a => a.id === p.asset_id)?.name || T('Pin', 'دبوس')

  if (loading) return <div className="p-8 text-on-surface-variant">{T('Loading…', 'جارٍ التحميل…')}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-on-surface">{T('Floor Plans', 'المخططات الطابقية')}</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {T('Upload a plan and pin spaces & assets onto it.', 'ارفع مخططًا وثبّت المساحات والأصول عليه.')}
          </p>
        </div>

        {error && <p className="text-error text-sm">{error}</p>}

        {canWrite && (
          <form onSubmit={createPlan} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">{T('Plan name', 'اسم المخطط')}</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} required className={inputCls} placeholder={T('e.g. Ground Floor', 'مثال: الطابق الأرضي')} />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">{T('Site', 'الموقع')}</label>
              <select value={newSite} onChange={e => setNewSite(e.target.value)} required className={inputCls}>
                <option value="">{T('Select site…', 'اختر موقعًا…')}</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">{T('Image', 'الصورة')}</label>
              <input ref={fileRef} type="file" accept="image/*" className="block w-full text-sm text-on-surface-variant" />
            </div>
            <button type="submit" disabled={uploading}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-70">
              {uploading ? T('Uploading…', 'جارٍ الرفع…') : T('Add Plan +', '+ إضافة مخطط')}
            </button>
          </form>
        )}

        {plans.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant">
            <p className="text-lg">{T('No floor plans yet.', 'لا توجد مخططات بعد.')}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {plans.map(p => (
              <button key={p.id} onClick={() => selectPlan(p.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${selectedId === p.id ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-on-surface">{selected.name}</h2>
              <span className="text-xs text-on-surface-variant">{sites.find(s => s.id === selected.site_id)?.name}</span>
              <span className="text-xs text-on-surface-variant">· {pins.length} {T('pin(s)', 'دبوس')}</span>
              <div className="ms-auto flex gap-2">
                {canWrite && selected.image_url && (
                  <button onClick={() => { setAddMode(m => !m); setPending(null); setOpenPin(null) }}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${addMode ? 'bg-primary text-on-primary border-primary' : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'}`}>
                    {addMode ? T('Click the plan to place…', 'انقر على المخطط لوضع دبوس…') : T('Add Pin', 'إضافة دبوس')}
                  </button>
                )}
                {canWrite && (
                  <button onClick={() => deletePlan(selected.id)}
                    className="text-error border border-error/20 bg-error/10 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-error/20 transition-colors">
                    {T('Delete Plan', 'حذف المخطط')}
                  </button>
                )}
              </div>
            </div>

            {selected.image_url ? (
              <div className="relative inline-block max-w-full" style={{ cursor: addMode ? 'crosshair' : 'default' }} onClick={onImageClick}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.image_url} alt={selected.name} className="max-w-full block rounded-lg border border-outline-variant" />
                {pins.map(p => (
                  <button key={p.id} type="button"
                    onClick={e => { e.stopPropagation(); setOpenPin(openPin === p.id ? null : p.id) }}
                    title={pinLabelText(p)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-primary border-2 border-on-primary shadow-md hover:scale-125 transition-transform"
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                    {openPin === p.id && (
                      <div onClick={e => e.stopPropagation()}
                        className="absolute left-1/2 -translate-x-1/2 top-6 z-10 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg p-3 w-[200px] text-start cursor-default">
                        <p className="text-sm font-semibold text-on-surface mb-1">{pinLabelText(p)}</p>
                        {p.space_id && <p className="text-xs text-on-surface-variant">{T('Space: ', 'مساحة: ')}{spaces.find(s => s.id === p.space_id)?.name}</p>}
                        {p.asset_id && <p className="text-xs text-on-surface-variant">{T('Asset: ', 'أصل: ')}{assets.find(a => a.id === p.asset_id)?.name}</p>}
                        {canWrite && (
                          <button onClick={() => deletePin(p.id)}
                            className="mt-2 text-error text-xs font-semibold hover:underline">{T('Remove pin', 'إزالة الدبوس')}</button>
                        )}
                      </div>
                    )}
                  </button>
                ))}
                {pending && (
                  <div className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-tertiary border-2 border-on-primary animate-pulse"
                    style={{ left: `${pending.x}%`, top: `${pending.y}%` }} />
                )}
              </div>
            ) : (
              <p className="text-on-surface-variant text-sm">{T('This plan has no image.', 'لا توجد صورة لهذا المخطط.')}</p>
            )}

            {pending && canWrite && (
              <div className="border border-outline-variant rounded-xl p-4 space-y-3 max-w-[420px]">
                <p className="text-sm font-bold text-on-surface">{T('New pin', 'دبوس جديد')}</p>
                <input value={pinLabel} onChange={e => setPinLabel(e.target.value)} className={inputCls} placeholder={T('Label (optional)', 'التسمية (اختياري)')} />
                <select value={pinSpace} onChange={e => setPinSpace(e.target.value)} className={inputCls}>
                  <option value="">{T('Link a space (optional)…', 'ربط مساحة (اختياري)…')}</option>
                  {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={pinAsset} onChange={e => setPinAsset(e.target.value)} className={inputCls}>
                  <option value="">{T('Link an asset (optional)…', 'ربط أصل (اختياري)…')}</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={savePin} className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors">{T('Save pin', 'حفظ الدبوس')}</button>
                  <button onClick={() => setPending(null)} className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">{T('Cancel', 'إلغاء')}</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
