'use client'

// FM-04 — Statutory compliance certificate register. List of certificates with
// live expiry flags (expired / expiring ≤30d) + an inline create form. Writes go
// through the RLS'd browser client (org-scoped by policy); doc upload reuses
// /api/upload (media bucket, <orgId>/compliance/ prefix). Alerts (90/30/7d email)
// are a separate cron follow-up per the gap-analysis spec.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

const TYPES = ['civil_defense', 'elevator', 'fire_system', 'water_tank', 'pressure_vessel', 'other'] as const

// days until expiry (negative = already expired)
function daysLeft(expires: string): number {
  const ms = new Date(expires + 'T00:00:00').getTime() - Date.now()
  return Math.ceil(ms / 86_400_000)
}

export default function CompliancePage() {
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'

  const [orgId, setOrgId] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [sites, setSites] = useState<Row[]>([])
  const [assets, setAssets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | typeof TYPES[number]>('all')

  const [form, setForm] = useState({
    title: '', type: 'other', certificate_no: '', issuer: '',
    site_id: '', asset_id: '', issued_at: '', expires_at: '', notes: '',
  })
  const [file, setFile] = useState<File | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile?.organisation_id) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    const [certs, siteData, assetData] = await Promise.all([
      supabase.from('compliance_certificates')
        .select('*, site:site_id(name), asset:asset_id(name)')
        .order('expires_at', { ascending: true }),
      supabase.from('sites').select('id, name').order('name'),
      supabase.from('assets').select('id, name').order('name'),
    ])
    if (certs.data) setRows(certs.data)
    if (siteData.data) setSites(siteData.data)
    if (assetData.data) setAssets(assetData.data)
    setLoading(false)
  }

  const filtered = useMemo(
    () => typeFilter === 'all' ? rows : rows.filter(r => r.type === typeFilter),
    [rows, typeFilter]
  )

  const stats = useMemo(() => {
    let expired = 0, soon = 0
    for (const r of rows) {
      const d = daysLeft(r.expires_at)
      if (d < 0) expired++
      else if (d <= 30) soon++
    }
    return { total: rows.length, expired, soon }
  }, [rows])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!orgId || saving) return
    if (!form.title.trim() || !form.expires_at) { alert(t('compliance.err_required')); return }
    setSaving(true)
    try {
      let doc_url: string | null = null
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`/api/upload?bucket=media&prefix=${orgId}/compliance`, { method: 'POST', body: fd })
        if (res.ok) { doc_url = (await res.json()).publicUrl ?? null }
        else { alert(t('compliance.err_upload')); setSaving(false); return }
      }
      const { error } = await supabase.from('compliance_certificates').insert({
        organisation_id: orgId,
        title: form.title.trim(),
        type: form.type,
        certificate_no: form.certificate_no.trim() || null,
        issuer: form.issuer.trim() || null,
        site_id: form.site_id || null,
        asset_id: form.asset_id || null,
        issued_at: form.issued_at || null,
        expires_at: form.expires_at,
        doc_url,
        notes: form.notes.trim() || null,
      })
      if (error) { alert(error.message); setSaving(false); return }
      setForm({ title: '', type: 'other', certificate_no: '', issuer: '', site_id: '', asset_id: '', issued_at: '', expires_at: '', notes: '' })
      setFile(null)
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 bg-surface-container-low border border-outline-variant/40 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all'

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-[1440px] mx-auto">

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('compliance.title')}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{stats.total} {t('compliance.subtitle')}</p>
          </div>
          <button onClick={() => setShowForm(v => !v)}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
            <span className="material-symbols-outlined text-lg">{showForm ? 'close' : 'add'}</span>
            {showForm ? t('common.cancel') : t('compliance.new')}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: t('compliance.stat.total'), value: stats.total, icon: 'verified', cls: 'text-on-surface' },
            { label: t('compliance.stat.soon'), value: stats.soon, icon: 'schedule', cls: 'text-[#f57f17]' },
            { label: t('compliance.stat.expired'), value: stats.expired, icon: 'error', cls: 'text-error' },
          ].map(c => (
            <div key={c.label} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 text-on-surface-variant mb-1">
                <span className="material-symbols-outlined text-lg">{c.icon}</span>
                <span className="text-xs font-semibold uppercase tracking-wider">{c.label}</span>
              </div>
              <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={submit} className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">{t('compliance.f.title')} *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} required />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">{t('compliance.f.type')}</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className={inputCls}>
                {TYPES.map(ty => <option key={ty} value={ty}>{t('compliance.type.' + ty)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">{t('compliance.f.number')}</label>
              <input value={form.certificate_no} onChange={e => setForm({ ...form, certificate_no: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">{t('compliance.f.issuer')}</label>
              <input value={form.issuer} onChange={e => setForm({ ...form, issuer: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">{t('common.site')}</label>
              <select value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} className={inputCls}>
                <option value="">{t('compliance.none')}</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">{t('compliance.f.asset')}</label>
              <select value={form.asset_id} onChange={e => setForm({ ...form, asset_id: e.target.value })} className={inputCls}>
                <option value="">{t('compliance.none')}</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">{t('compliance.f.issued')}</label>
              <input type="date" value={form.issued_at} onChange={e => setForm({ ...form, issued_at: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-on-surface-variant mb-1">{t('compliance.f.expires')} *</label>
              <input type="date" value={form.expires_at} onChange={e => setForm({ ...form, expires_at: e.target.value })} className={inputCls} required />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1">{t('compliance.f.doc')}</label>
              <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-on-surface-variant file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:font-semibold" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-on-surface-variant mb-1">{t('compliance.f.notes')}</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit" disabled={saving}
                className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60">
                {saving ? t('common.loading') : t('compliance.save')}
              </button>
            </div>
          </form>
        )}

        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${typeFilter === 'all' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container-low text-on-surface-variant border-transparent hover:border-outline-variant'}`}>
            {t('common.all')}
          </button>
          {TYPES.map(ty => (
            <button key={ty} onClick={() => setTypeFilter(ty)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${typeFilter === ty ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container-low text-on-surface-variant border-transparent hover:border-outline-variant'}`}>
              {t('compliance.type.' + ty)}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-on-surface-variant py-8 text-center">{t('common.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">verified</span>
            <p className="text-lg font-semibold mb-1">{t('compliance.empty')}</p>
            <p className="text-sm">{t('compliance.empty_hint')}</p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container border-b border-outline-variant/30">
                    {[t('compliance.f.title'), t('compliance.f.type'), t('compliance.col.scope'), t('compliance.f.expires'), t('common.status'), t('compliance.f.doc')].map(h => (
                      <th key={h} className={`p-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap ${isAr ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.map(r => {
                    const d = daysLeft(r.expires_at)
                    const expired = d < 0
                    const soon = !expired && d <= 30
                    const scope = r.asset?.name ?? r.site?.name ?? t('compliance.org_wide')
                    return (
                      <tr key={r.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="p-3">
                          <span className="text-sm font-semibold text-on-surface">{r.title}</span>
                          {r.certificate_no && <p className="text-xs text-on-surface-variant/70 mt-0.5 font-mono">{r.certificate_no}</p>}
                          {r.issuer && <p className="text-xs text-on-surface-variant mt-0.5">{r.issuer}</p>}
                        </td>
                        <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{t('compliance.type.' + r.type)}</td>
                        <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{scope}</td>
                        <td className={`p-3 text-sm whitespace-nowrap ${expired ? 'text-error font-semibold' : soon ? 'text-[#f57f17] font-semibold' : 'text-on-surface-variant'}`}>{r.expires_at}</td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${expired ? 'bg-error/10 text-error' : soon ? 'bg-[#f57f17]/10 text-[#f57f17]' : 'bg-primary-container/90 text-on-primary-container'}`}>
                            {expired ? t('compliance.expired') : soon ? `${t('compliance.in_days').replace('{n}', String(d))}` : t('compliance.valid')}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {r.doc_url
                            ? <a href={r.doc_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1"><span className="material-symbols-outlined text-base">description</span>{t('compliance.view_doc')}</a>
                            : <span className="text-sm text-on-surface-variant">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
