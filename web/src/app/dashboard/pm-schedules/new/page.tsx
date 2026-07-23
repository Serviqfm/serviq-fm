'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { rollNextDue } from '../pm-utils'
import { stampChecklistTasks } from '../checklist-stamp'
import { fetchWoCategories, catLabel, type WoCategory } from '@/lib/woCategories'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [checklists, setChecklists] = useState<any[]>([])
  const [categories, setCategories] = useState<WoCategory[]>([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    frequency: 'monthly',
    priority: 'medium',            // 1C-12: copied onto generated WOs
    category: '',                  // 1C-12: copied onto generated WOs
    site_id: '',
    assigned_to: '',
    checklist_template_id: '',     // FM-05: stamped onto generated WOs
    next_due_at: '',
    end_date: '',
    lead_time_days: '',           // CORE-33: WO is created N days before due (cron default 2)
    estimated_duration_minutes: '',
    is_seasonal: false,            // FM-18: seasonal window honored by the cron
    seasonal_start_month: '1',
    seasonal_end_month: '12',
    scheduling_mode: 'fixed',      // 1C-09: 'fixed' | 'floating'
    interval_count: '',            // 1C-10: blank = use frequency preset
    interval_unit: 'month',
    anchor_day: '',                // day-of-month (month/year units)
  })
  const [requiresSignature, setRequiresSignature] = useState(false)  // 1C-12: sign-off enforced at WO close
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
    const [{ data: assetData }, { data: siteData }, { data: techData }, { data: checklistData }] = await Promise.all([
      supabase.from('assets').select('id, name').eq('organisation_id', orgId).eq('status', 'active'),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
      supabase.from('checklist_templates').select('id, name, name_ar').eq('organisation_id', orgId).order('name'),
    ])
    if (assetData) setAssets(assetData)
    if (siteData) setSites(siteData)
    if (techData) setTechnicians(techData)
    if (checklistData) setChecklists(checklistData)
    setCategories(await fetchWoCategories(supabase))
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
      priority: form.priority,
      category: form.category || null,
      requires_signature: requiresSignature,
      asset_id: aid,
      site_id: form.site_id || null,
      assigned_to: form.assigned_to || null,
      checklist_template_id: form.checklist_template_id || null,
      next_due_at: form.next_due_at || null,
      end_date: form.end_date || null,
      lead_time_days: form.lead_time_days ? parseInt(form.lead_time_days) : null,
      is_seasonal: form.is_seasonal,
      seasonal_start_month: form.is_seasonal ? parseInt(form.seasonal_start_month) : null,
      seasonal_end_month: form.is_seasonal ? parseInt(form.seasonal_end_month) : null,
      days_of_week: form.frequency === 'weekly' && daysOfWeek.length > 0 ? daysOfWeek : null,
      estimated_duration_minutes: form.estimated_duration_minutes ? parseInt(form.estimated_duration_minutes) : null,
      scheduling_mode: form.scheduling_mode,
      interval_count: form.interval_count ? parseInt(form.interval_count) : null,
      interval_unit: form.interval_count ? form.interval_unit : null,
      anchor_day: form.interval_count && ['month', 'year'].includes(form.interval_unit) && form.anchor_day
        ? parseInt(form.anchor_day) : null,
      organisation_id: profile.organisation_id,
      is_active: true,
    }))
    const { data: created, error: insertError } = await supabase.from('pm_schedules').insert(rows)
      .select('id, title, description, frequency, priority, category, asset_id, site_id, assigned_to, checklist_template_id, estimated_duration_minutes, organisation_id, next_due_at, end_date, days_of_week, scheduling_mode, interval_count, interval_unit, anchor_day')
    if (insertError) { setError(insertError.message); setLoading(false); return }

    // Optionally create the first work order immediately — same WO shape as
    // /api/cron/pm-generate, then roll next_due_at forward like the cron does.
    if (createFirstWO && created) {
      for (const pm of created) {
        if (!pm.next_due_at) continue
        if (pm.end_date && new Date(pm.next_due_at) > new Date(pm.end_date)) continue
        const { data: newWO, error: woError } = await supabase.from('work_orders').insert({
          organisation_id: pm.organisation_id,
          title: `PM - ${pm.title}`,
          description: pm.description,
          priority: pm.priority ?? 'medium',
          category: pm.category ?? null,
          status: pm.assigned_to ? 'assigned' : 'new',
          source: 'pm_schedule',
          pm_schedule_id: pm.id,
          asset_id: pm.asset_id,
          site_id: pm.site_id,
          assigned_to: pm.assigned_to,
          due_at: pm.next_due_at,
          sla_hours: pm.estimated_duration_minutes ? Math.ceil(pm.estimated_duration_minutes / 60) : null,
          created_by: user.id,
        }).select('id').single()
        if (woError || !newWO) continue
        // FM-05: stamp the schedule's checklist onto the first WO.
        await stampChecklistTasks(supabase, { organisationId: pm.organisation_id, workOrderId: newWO.id, templateId: pm.checklist_template_id })
        const rec = { interval_count: pm.interval_count, interval_unit: pm.interval_unit, anchor_day: pm.anchor_day }
        // Floating: next due is one interval after this WO would complete — approximate
        // from now (cron re-anchors off the real completed_at). Fixed: roll off due date.
        const rollFrom = pm.scheduling_mode === 'floating' ? new Date() : new Date(pm.next_due_at)
        const nextDue = rollNextDue(rollFrom, pm.frequency, pm.days_of_week, rec)
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
  const months = lang === 'ar'
    ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

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
        <div style={{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'نمط الجدولة' : 'Scheduling Mode'}</label>
            <select name='scheduling_mode' value={form.scheduling_mode} onChange={handleChange} style={fieldStyle}>
              <option value='fixed'>{lang === 'ar' ? 'ثابت (تقويمي)' : 'Fixed (calendar-based)'}</option>
              <option value='floating'>{lang === 'ar' ? 'عائم (بعد الإكمال)' : 'Floating (after completion)'}</option>
            </select>
            <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
              {form.scheduling_mode === 'floating'
                ? (lang === 'ar' ? 'يُنشأ الأمر التالي بعد اكتمال السابق بفترة واحدة.' : 'The next work order is created one interval after the previous one is completed.')
                : (lang === 'ar' ? 'تُنشأ الأوامر على تواريخ تقويمية ثابتة.' : 'Work orders generate on fixed calendar dates.')}
            </p>
          </div>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'فاصل مخصص (اختياري)' : 'Custom interval (optional)'}</label>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>
              {lang === 'ar' ? 'اترك الرقم فارغاً لاستخدام التكرار أعلاه. الأشهر/السنوات تستخدم تواريخ تقويمية حقيقية.' : 'Leave the number blank to use the frequency preset above. Months/years use true calendar dates.'}
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#444' }}>{lang === 'ar' ? 'كل' : 'Every'}</span>
              <input name='interval_count' type='number' min='1' value={form.interval_count} onChange={handleChange} placeholder='N' style={{ ...fieldStyle, width: 80 }} />
              <select name='interval_unit' value={form.interval_unit} onChange={handleChange} style={{ ...fieldStyle, flex: 1 }}>
                <option value='day'>{lang === 'ar' ? 'يوم/أيام' : 'day(s)'}</option>
                <option value='week'>{lang === 'ar' ? 'أسبوع/أسابيع' : 'week(s)'}</option>
                <option value='month'>{lang === 'ar' ? 'شهر/أشهر' : 'month(s)'}</option>
                <option value='year'>{lang === 'ar' ? 'سنة/سنوات' : 'year(s)'}</option>
              </select>
            </div>
            {form.interval_count && ['month', 'year'].includes(form.interval_unit) && (
              <div style={{ marginTop: 8 }}>
                <label style={labelStyle}>{lang === 'ar' ? 'يوم من الشهر (اختياري)' : 'Day of month (optional)'}</label>
                <input name='anchor_day' type='number' min='1' max='31' value={form.anchor_day} onChange={handleChange} placeholder={lang === 'ar' ? 'مثال: 1 أو 15' : 'e.g. 1 or 15'} style={{ ...fieldStyle, width: 120 }} />
              </div>
            )}
          </div>
        </div>
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
            <label style={labelStyle}>{lang === 'ar' ? 'الأولوية' : 'Priority'}</label>
            <select name='priority' value={form.priority} onChange={handleChange} style={fieldStyle}>
              <option value='low'>{lang === 'ar' ? 'منخفضة' : 'Low'}</option>
              <option value='medium'>{lang === 'ar' ? 'متوسطة' : 'Medium'}</option>
              <option value='high'>{lang === 'ar' ? 'عالية' : 'High'}</option>
              <option value='critical'>{lang === 'ar' ? 'حرجة' : 'Critical'}</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'قائمة المهام (اختياري)' : 'Checklist (optional)'}</label>
            <select name='checklist_template_id' value={form.checklist_template_id} onChange={handleChange} style={fieldStyle}>
              <option value=''>{lang === 'ar' ? 'بدون قائمة' : 'No checklist'}</option>
              {checklists.map(c => <option key={c.id} value={c.id}>{lang === 'ar' && c.name_ar ? c.name_ar : c.name}</option>)}
            </select>
            <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
              {lang === 'ar' ? 'تُنسخ مهام القائمة إلى كل أمر عمل يُنشأ.' : 'The checklist items are copied onto every generated work order.'}
            </p>
          </div>
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'الفئة (اختياري)' : 'Category (optional)'}</label>
          <select name='category' value={form.category} onChange={handleChange} style={fieldStyle}>
            <option value=''>{lang === 'ar' ? 'بدون فئة' : 'No category'}</option>
            {categories.map(c => <option key={c.name} value={c.name}>{catLabel(c, lang)}</option>)}
          </select>
          <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
            {lang === 'ar' ? 'تُنسخ الفئة إلى كل أمر عمل يُنشأ.' : 'The category is copied onto every generated work order.'}
          </p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f9f9f9', border: '1px solid #eee', borderRadius: 8, padding: '10px 14px', cursor: 'pointer' }}>
          <input type='checkbox' checked={requiresSignature} onChange={e => setRequiresSignature(e.target.checked)} style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#444' }}>
            {lang === 'ar' ? 'يتطلب توقيعاً عند الإغلاق' : 'Require sign-off at close'}
          </span>
          <span style={{ fontSize: 12, color: '#666' }}>
            {lang === 'ar' ? 'لا يمكن إغلاق أوامر العمل المُنشأة بدون توقيع مكتوب.' : 'Generated work orders cannot be closed without a typed sign-off.'}
          </span>
        </label>
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
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'أيام التجهيز المسبق' : 'Lead time (days)'}</label>
            <input name='lead_time_days' type='number' min='0' value={form.lead_time_days} onChange={handleChange} placeholder='2' style={fieldStyle} />
            <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>
              {lang === 'ar' ? 'يُنشأ أمر العمل قبل تاريخ الاستحقاق بهذا العدد من الأيام (الافتراضي 2).' : 'The work order is created this many days before the due date (default 2).'}
            </p>
          </div>
        </div>
        <div style={{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: 8, padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.is_seasonal ? 12 : 0 }}>
            <input type='checkbox' id='is_seasonal' checked={form.is_seasonal} onChange={e => setForm(prev => ({ ...prev, is_seasonal: e.target.checked }))} style={{ width: 16, height: 16 }} />
            <label htmlFor='is_seasonal' style={{ fontSize: 13, fontWeight: 500, color: '#444', cursor: 'pointer' }}>{lang === 'ar' ? 'جدول موسمي' : 'Seasonal schedule'}</label>
          </div>
          {form.is_seasonal && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              <div>
                <label style={labelStyle}>{lang === 'ar' ? 'يعمل من شهر' : 'Active from month'}</label>
                <select name='seasonal_start_month' value={form.seasonal_start_month} onChange={handleChange} style={fieldStyle}>
                  {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{lang === 'ar' ? 'حتى شهر' : 'Active until month'}</label>
                <select name='seasonal_end_month' value={form.seasonal_end_month} onChange={handleChange} style={fieldStyle}>
                  {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
            </div>
          )}
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