'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'

export default function EditSitePage() {
  const router = useRouter()
  const { id } = useParams()
  const { lang } = useLanguage()
  const supabase = createClient()
  const { isHidden, isRequired, loading: configLoading } = useFieldConfig('sites_edit')
  const isReq = (key: string) => isRequired(key) || isSystemRequired('sites_edit', key)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', name_ar: '', city: '', address: '', latitude: '', longitude: '', assigned_team_id: '', invoicing_enabled: false })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [teams, setTeams] = useState<any[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSite() }, [id])

  async function loadSite() {
    const { data } = await supabase.from('sites').select('*').eq('id', id).single()
    if (data) {
      setForm({
        name: data.name ?? '', name_ar: data.name_ar ?? '', city: data.city ?? '', address: data.address ?? '',
        latitude: data.latitude != null ? String(data.latitude) : '', longitude: data.longitude != null ? String(data.longitude) : '',
        assigned_team_id: data.assigned_team_id ?? '', invoicing_enabled: data.invoicing_enabled ?? false,
      })
      const { data: teamRows } = await supabase.from('teams').select('id, name, name_ar').eq('organisation_id', data.organisation_id).order('name')
      setTeams(teamRows ?? [])
    }
    setLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch(`/api/sites/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        name_ar: form.name_ar,
        city: form.city,
        address: form.address,
        latitude: form.latitude,
        longitude: form.longitude,
        assigned_team_id: form.assigned_team_id,
        invoicing_enabled: form.invoicing_enabled,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.error ?? 'Failed to update site')
      setSaving(false)
      return
    }
    router.push('/dashboard/sites')
  }

  if (loading || configLoading) return <div className="p-8 text-on-surface-variant">Loading...</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[680px] mx-auto space-y-6">
        <div>
          <a href='/dashboard/sites' className="text-on-surface-variant text-sm hover:text-primary transition-colors">
            {lang === 'ar' ? 'رجوع للمواقع' : 'Back to Sites'}
          </a>
          <h1 className="text-3xl font-bold text-on-surface mt-2">
            {lang === 'ar' ? 'تعديل الموقع' : 'Edit Site'}
          </h1>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {!isHidden('name') && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  {lang === 'ar' ? 'اسم الموقع (إنجليزي)' : 'Site Name (English)'}{isReq('name') && <span className="text-error"> *</span>}
                </label>
                <input name='name' value={form.name} onChange={handleChange} required={isReq('name')}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
              </div>
            )}
            {!isHidden('name_ar') && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  {lang === 'ar' ? 'اسم الموقع (عربي)' : 'Site Name (Arabic)'}{isReq('name_ar') && <span className="text-error"> *</span>}
                </label>
                <input name='name_ar' value={form.name_ar} onChange={handleChange} required={isReq('name_ar')} placeholder='اختياري'
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-right"
                  dir="rtl" />
              </div>
            )}
            {!isHidden('city') && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  {lang === 'ar' ? 'المدينة' : 'City'}{isReq('city') && <span className="text-error"> *</span>}
                </label>
                <input name='city' value={form.city} onChange={handleChange} required={isReq('city')}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
              </div>
            )}
            {!isHidden('address') && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  {lang === 'ar' ? 'العنوان' : 'Address'}{isReq('address') && <span className="text-error"> *</span>}
                </label>
                <input name='address' value={form.address} onChange={handleChange} required={isReq('address')}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
              </div>
            )}
            {(!isHidden('latitude') || !isHidden('longitude')) && (
              <div className="grid grid-cols-2 gap-4">
                {!isHidden('latitude') && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'خط العرض' : 'Latitude'}{isReq('latitude') && <span className="text-error"> *</span>}
                    </label>
                    <input name='latitude' type='number' step='any' value={form.latitude} onChange={handleChange} required={isReq('latitude')} placeholder='24.7136'
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
                  </div>
                )}
                {!isHidden('longitude') && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'خط الطول' : 'Longitude'}{isReq('longitude') && <span className="text-error"> *</span>}
                    </label>
                    <input name='longitude' type='number' step='any' value={form.longitude} onChange={handleChange} required={isReq('longitude')} placeholder='46.6753'
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
                  </div>
                )}
              </div>
            )}
            {!isHidden('assigned_team_id') && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                  {lang === 'ar' ? 'الفريق المسؤول' : 'Assigned Team'}{isReq('assigned_team_id') && <span className="text-error"> *</span>}
                </label>
                <select name='assigned_team_id' value={form.assigned_team_id} onChange={handleChange} required={isReq('assigned_team_id')}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all">
                  <option value=''>{lang === 'ar' ? '— لا يوجد —' : '— None —'}</option>
                  {teams.map(tm => (
                    <option key={tm.id} value={tm.id}>{lang === 'ar' && tm.name_ar ? tm.name_ar : tm.name}</option>
                  ))}
                </select>
              </div>
            )}
            {!isHidden('invoicing_enabled') && (
              <div className="flex items-center gap-3 py-2">
                <input
                  type='checkbox'
                  id='invoicing_enabled'
                  checked={form.invoicing_enabled}
                  onChange={e => setForm(prev => ({ ...prev, invoicing_enabled: e.target.checked }))}
                  className="w-4 h-4 cursor-pointer accent-primary"
                />
                <label htmlFor='invoicing_enabled' className="block text-[11px] font-bold uppercase tracking-wider text-secondary cursor-pointer">
                  {lang === 'ar' ? 'تفعيل الفوترة لهذا الموقع' : 'Enable invoicing for this site'}
                </label>
              </div>
            )}
            {error && <p className="text-error text-sm">{error}</p>}
            <div className="flex gap-3">
              <button type='submit' disabled={saving}
                className={`flex-1 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}>
                {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
              </button>
              <a href='/dashboard/sites' className="flex-1">
                <button type='button' className="w-full border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
