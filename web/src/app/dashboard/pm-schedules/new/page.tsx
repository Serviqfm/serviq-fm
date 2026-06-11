'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { rollNextDue } from '../pm-utils'

export default function NewPMSchedulePage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assets, setAssets] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [technicians, setTechnicians] = useState<any[]>([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    frequency: 'monthly',
    site_id: '',
    assigned_to: '',
    next_due_at: '',
    end_date: '',
    estimated_duration_minutes: '',
  })
  const [selectedAssets, setSelectedAssets] = useState<string[]>([])
  const [assetSearch, setAssetSearch] = useState('')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([])
  const [createFirstWO, setCreateFirstWO] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadFormData() }, [])

  async function loadFormData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id
    const [{ data: assetData }, { data: siteData }, { data: techData }] = await Promise.all([
      supabase.from('assets').select('id, name').eq('organisation_id', orgId).eq('status', 'active'),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
    ])
    if (assetData) setAssets(assetData)
    if (siteData) setSites(siteData)
    if (techData) setTechnicians(techData)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in'); setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setError('User profile not found'); setLoading(false); return }

    // If multiple assets are selected, insert one schedule per asset; if none, insert a single
    // unscoped schedule.
    const assetIds = selectedAssets.length > 0 ? selectedAssets : [null]
    const rows = assetIds.map(aid => ({
      title: form.title,
      description: form.description || null,
      frequency: form.frequency,
      asset_id: aid,
      site_id: form.site_id || null,
      assigned_to: form.assigned_to || null,
      next_due_at: form.next_due_at || null,
      end_date: form.end_date || null,
      days_of_week: form.frequency === 'weekly' && daysOfWeek.length > 0 ? daysOfWeek : null,
      estimated_duration_minutes: form.estimated_duration_minutes ? parseInt(form.estimated_duration_minutes) : null,
      organisation_id: profile.organisation_id,
      is_active: true,
    }))
    const { data: created, error: insertError } = await supabase.from('pm_schedules').insert(rows)
      .select('id, title, description, frequency, asset_id, site_id, assigned_to, estimated_duration_minutes, organisation_id, next_due_at, end_date, days_of_week')
    if (insertError) { setError(insertError.message); setLoading(false); return }

    // Optionally create the first work order immediately — same WO shape as
    // /api/cron/pm-generate, then roll next_due_at forward like the cron does.
    if (createFirstWO && created) {
      for (const pm of created) {
        if (!pm.next_due_at) continue
        if (pm.end_date && new Date(pm.next_due_at) > new Date(pm.end_date)) continue
        const { error: woError } = await supabase.from('work_orders').insert({
          organisation_id: pm.organisation_id,
          title: `PM - ${pm.title}`,
          description: pm.description,
          priority: 'medium',
          status: pm.assigned_to ? 'assigned' : 'new',
          source: 'pm_schedule',
          pm_schedule_id: pm.id,
          asset_id: pm.asset_id,
          site_id: pm.site_id,
          assigned_to: pm.assigned_to,
          due_at: pm.next_due_at,
          sla_hours: pm.estimated_duration_minutes ? Math.ceil(pm.estimated_duration_minutes / 60) : null,
          created_by: user.id,
        })
        if (woError) continue
        const nextDue = rollNextDue(new Date(pm.next_due_at), pm.frequency, pm.days_of_week)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const upd: any = { next_due_at: nextDue.toISOString(), last_generated_at: new Date().toISOString() }
        if (pm.end_date && nextDue > new Date(pm.end_date)) upd.is_active = false
        await supabase.from('pm_schedules').update(upd).eq('id', pm.id)
      }
    }
    router.push('/dashboard/pm-schedules')
  }

  function toggleDay(day: number) {
    setDaysOfWeek(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort((a, b) => a - b))
  }

  function toggleAsset(id: string) {
    setSelectedAssets(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }
  const dayNames = lang === 'ar'
    ? ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const templates = [
    { label: 'AC Filter Cleaning', description: 'Clean and replace AC filters, check refrigerant levels, inspect coils' },
    { label: 'Fire Safety Check', description: 'Inspect fire extinguishers, check expiry dates, test fire alarm panel' },
    { label: 'Elevator Service', description: 'Monthly elevator inspection, lubrication, safety test and logbook update' },
    { label: 'Pool Chemical Check', description: 'Test pH and chlorine levels, add chemicals as required, inspect pump and filter' },
    { label: 'Generator Test Run', description: 'Run generator for 30 minutes under load, check fuel level and battery' },
    { label: 'Refrigeration PM', description: 'Check temperature logs, clean condenser coils, inspect door seals' },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/pm-schedules' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع' : 'Back to PM Schedules'}</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>{lang === 'ar' ? 'جدول صيانة جديد' : 'New PM Schedule'}</h1>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#444' }}>{lang === 'ar' ? 'قوالب سريعة' : 'Quick templates'}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {templates.map(t => (
            <button key={t.label} type='button' onClick={() => setForm(prev => ({ ...prev, title: t.label, description: t.description }))} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 12, color: '#444' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Schedule Title *</label>
          <input name='title' value={form.title} onChange={handleChange} required placeholder='e.g. Monthly AC Filter Cleaning' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'وصف المهمة' : 'Task Description'}</label>
          <textarea name='description' value={form.description} onChange={handleChange} rows={3} placeholder='Describe what needs to be done...' style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Frequency *</label>
            <select name='frequency' value={form.frequency} onChange={handleChange} style={fieldStyle}>
              <option value='daily'>{lang === 'ar' ? 'يومي' : 'Daily'}</option>
              <option value='weekly'>{lang === 'ar' ? 'أسبوعي' : 'Weekly'}</option>
              <option value='fortnightly'>Fortnightly (Every 2 weeks)</option>
              <option value='monthly'>{lang === 'ar' ? 'شهري' : 'Monthly'}</option>
              <option value='quarterly'>{lang === 'ar' ? 'ربع سنوي' : 'Quarterly'}</option>
              <option value='biannual'>Every 6 Months</option>
              <option value='annual'>{lang === 'ar' ? 'سنوي' : 'Annual'}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'المدة التقديرية (دقائق)' : 'Estimated Duration (minutes)'}</label>
            <input name='estimated_duration_minutes' type='number' value={form.estimated_duration_minutes} onChange={handleChange} placeholder='e.g. 60' min='1' style={fieldStyle} />
          </div>
        </div>
        {form.frequency === 'weekly' && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'أيام الأسبوع' : 'Days of Week'}</label>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>
              {lang === 'ar' ? 'اختر الأيام التي تستحق فيها الصيانة الأسبوعية. اتركها فارغة للتكرار كل 7 أيام.' : 'Pick which weekdays this weekly schedule lands on. Leave empty to repeat every 7 days.'}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {dayNames.map((d, i) => (
                <button
                  key={i}
                  type='button'
                  onClick={() => toggleDay(i)}
                  style={{
                    padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    border: daysOfWeek.includes(i) ? '1px solid #006b54' : '1px solid #ddd',
                    background: daysOfWeek.includes(i) ? '#006b54' : 'white',
                    color: daysOfWeek.includes(i) ? 'white' : '#444',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label style={labelStyle}>
            {lang === 'ar' ? 'الأصول' : 'Assets'}
            {selectedAssets.length > 0 && <span style={{ marginLeft: 8, color: '#006b54', fontWeight: 600 }}>({selectedAssets.length} selected)</span>}
          </label>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>
            {lang === 'ar' ? 'حدد عدة أصول لإنشاء جدول صيانة لكل منها.' : 'Select multiple assets — one PM schedule will be created for each.'}
          </p>
          <input
            value={assetSearch}
            onChange={e => setAssetSearch(e.target.value)}
            placeholder={lang === 'ar' ? 'بحث في الأصول...' : 'Search assets...'}
            style={{ ...fieldStyle, marginBottom: 8 }}
          />
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #ddd', borderRadius: 8, background: 'white' }}>
            {assets.filter(a => !assetSearch || a.name?.toLowerCase().includes(assetSearch.toLowerCase())).length === 0 ? (
              <p style={{ padding: '12px', fontSize: 13, color: '#999', margin: 0 }}>
                {lang === 'ar' ? 'لا توجد أصول' : 'No assets'}
              </p>
            ) : (
              assets.filter(a => !assetSearch || a.name?.toLowerCase().includes(assetSearch.toLowerCase())).map(a => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5' }}>
                  <input type='checkbox' checked={selectedAssets.includes(a.id)} onChange={() => toggleAsset(a.id)} />
                  <span style={{ fontSize: 13 }}>{a.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'الموقع' : 'Site'}</label>
          <select name='site_id' value={form.site_id} onChange={handleChange} style={fieldStyle}>
            <option value=''>{lang === 'ar' ? 'اختر الموقع' : 'Select site'}</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'تعيين إلى' : 'Assign To'}</label>
            <select name='assigned_to' value={form.assigned_to} onChange={handleChange} style={fieldStyle}>
              <option value=''>{t('common.unassigned')}</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>First Due Date *</label>
            <input name='next_due_at' type='datetime-local' value={form.next_due_at} onChange={handleChange} required style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'تاريخ الانتهاء (اختياري)' : 'End Date (optional)'}</label>
            <input name='end_date' type='date' value={form.end_date} onChange={handleChange} style={fieldStyle} />
            <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
              {lang === 'ar' ? 'لن يتم إنشاء أوامر عمل بعد هذا التاريخ.' : 'No work orders will be generated after this date.'}
            </p>
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f9f9f9', border: '1px solid #eee', borderRadius: 8, padding: '10px 14px', cursor: 'pointer' }}>
          <input type='checkbox' checked={createFirstWO} onChange={e => setCreateFirstWO(e.target.checked)} style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#444' }}>
            {lang === 'ar' ? 'إنشاء أول أمر عمل الآن' : 'Create first work order now'}
          </span>
        </label>
        <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1565c0' }}>
          When this schedule is due, click Generate WO on the schedules list to create a work order automatically.
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? t('common.saving') : 'Create PM Schedule'}
        </button>
      </form>
    </div>
  )
}