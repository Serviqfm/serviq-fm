'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

const DEFAULT_TEMPLATES: Record<string, { name: string; vertical: string; items: any[] }> = {
  school: {
    name: 'School Safety Inspection',
    vertical: 'school',
    items: [
      { id: '1', label: 'Fire extinguishers accessible and in date', label_ar: 'طفايات الحريق متاحة وسارية المفعول', type: 'pass_fail', required: true },
      { id: '2', label: 'Emergency exit signage clear and unobstructed', label_ar: 'لافتات مخرج الطوارئ واضحة وغير مسدودة', type: 'pass_fail', required: true },
      { id: '3', label: 'First aid kit complete and stocked', label_ar: 'حقيبة الإسعافات الأولية مكتملة ومزودة', type: 'pass_fail', required: true },
      { id: '4', label: 'AC unit filter condition', label_ar: 'حالة فلتر وحدة التكييف', type: 'pass_fail', required: true },
      { id: '5', label: 'Electrical panel visual check - no exposed wiring', label_ar: 'فحص بصري للوحة الكهربائية', type: 'pass_fail', required: true },
      { id: '6', label: 'Playground equipment safety check', label_ar: 'فحص سلامة معدات الملعب', type: 'pass_fail', required: false },
      { id: '7', label: 'Classroom equipment condition score', label_ar: 'درجة حالة معدات الفصل الدراسي', type: 'score', required: false },
      { id: '8', label: 'Additional notes', label_ar: 'ملاحظات إضافية', type: 'text', required: false },
    ]
  },
  retail: {
    name: 'Retail Store Audit',
    vertical: 'retail',
    items: [
      { id: '1', label: 'Refrigeration unit temperature reading (°C)', label_ar: 'قراءة درجة حرارة وحدة التبريد', type: 'text', required: true },
      { id: '2', label: 'Refrigeration temperature within acceptable range', label_ar: 'درجة حرارة التبريد ضمن النطاق المقبول', type: 'pass_fail', required: true },
      { id: '3', label: 'HVAC system operational', label_ar: 'نظام التكييف يعمل', type: 'pass_fail', required: true },
      { id: '4', label: 'Store signage in good condition', label_ar: 'لافتات المتجر في حالة جيدة', type: 'pass_fail', required: false },
      { id: '5', label: 'Electrical fittings visual check', label_ar: 'فحص بصري للتركيبات الكهربائية', type: 'pass_fail', required: true },
      { id: '6', label: 'Emergency equipment accessible', label_ar: 'معدات الطوارئ متاحة', type: 'pass_fail', required: true },
      { id: '7', label: 'Housekeeping standards compliance score', label_ar: 'درجة امتثال معايير النظافة', type: 'score', required: false },
      { id: '8', label: 'Brand compliance photo required', label_ar: 'صورة امتثال العلامة التجارية مطلوبة', type: 'photo', required: false },
    ]
  },
  compound: {
    name: 'Compound Common Area Inspection',
    vertical: 'compound',
    items: [
      { id: '1', label: 'Pool pH level reading', label_ar: 'قراءة مستوى حموضة المسبح', type: 'text', required: true },
      { id: '2', label: 'Pool chlorine level reading', label_ar: 'قراءة مستوى الكلور في المسبح', type: 'text', required: true },
      { id: '3', label: 'Pool chemical levels acceptable', label_ar: 'مستويات مواد الكيماويات في المسبح مقبولة', type: 'pass_fail', required: true },
      { id: '4', label: 'Gym equipment condition and safety labels', label_ar: 'حالة معدات الصالة الرياضية وملصقات السلامة', type: 'pass_fail', required: true },
      { id: '5', label: 'Common area lighting operational', label_ar: 'إضاءة المناطق المشتركة تعمل', type: 'pass_fail', required: true },
      { id: '6', label: 'Fire hose reel and extinguisher accessible', label_ar: 'خرطوم الحريق وطفاية الحريق متاحان', type: 'pass_fail', required: true },
      { id: '7', label: 'Elevator interior condition', label_ar: 'حالة داخل المصعد', type: 'pass_fail', required: false },
      { id: '8', label: 'Landscaping and pathway safety', label_ar: 'سلامة المناظر الطبيعية والممرات', type: 'pass_fail', required: false },
    ]
  },
  hotel: {
    name: 'Hotel Room Preventive Inspection',
    vertical: 'hotel',
    items: [
      { id: '1', label: 'Bathroom fixtures functional (taps, shower, toilet)', label_ar: 'تركيبات الحمام تعمل', type: 'pass_fail', required: true },
      { id: '2', label: 'AC unit operational and filter condition', label_ar: 'وحدة التكييف تعمل وحالة الفلتر', type: 'pass_fail', required: true },
      { id: '3', label: 'In-room lighting all functional', label_ar: 'جميع الإضاءات في الغرفة تعمل', type: 'pass_fail', required: true },
      { id: '4', label: 'TV and telephone functional', label_ar: 'التلفزيون والهاتف يعملان', type: 'pass_fail', required: true },
      { id: '5', label: 'Door lock and safe operational', label_ar: 'قفل الباب والخزنة يعملان', type: 'pass_fail', required: true },
      { id: '6', label: 'Window seal condition', label_ar: 'حالة ختم النافذة', type: 'pass_fail', required: false },
      { id: '7', label: 'Minibar unit temperature acceptable', label_ar: 'درجة حرارة وحدة الميني بار مقبولة', type: 'pass_fail', required: false },
      { id: '8', label: 'Overall room condition score (1-5)', label_ar: 'درجة الحالة العامة للغرفة', type: 'score', required: false },
    ]
  }
}

export default function NewTemplatePage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [vertical, setVertical] = useState('general')
  const [items, setItems] = useState<any[]>([
    { id: '1', label: '', label_ar: '', type: 'pass_fail', required: true }
  ])

  function loadTemplate(key: string) {
    const tmpl = DEFAULT_TEMPLATES[key]
    if (!tmpl) return
    setName(tmpl.name)
    setVertical(tmpl.vertical)
    setItems(tmpl.items)
  }

  function addItem() {
    setItems(prev => [...prev, { id: String(Date.now()), label: '', label_ar: '', type: 'pass_fail', required: false }])
  }

  function updateItem(id: string, field: string, value: any) {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in'); setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setError('User profile not found'); setLoading(false); return }
    const { error: insertError } = await supabase.from('inspection_templates').insert({
      name,
      vertical: vertical || null,
      items,
      organisation_id: profile.organisation_id,
      is_default: false,
    })
    if (insertError) { setError(insertError.message); setLoading(false) }
    else router.push('/dashboard/inspections')
  }

  const fieldStyle = { width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' as const, background: 'white' }
  const typeOptions = [
    { value: 'pass_fail', label: lang === 'ar' ? 'ناجح / فاشل' : 'Pass / Fail' },
    { value: 'yes_no', label: lang === 'ar' ? 'نعم / لا' : 'Yes / No' },
    { value: 'score', label: lang === 'ar' ? 'تقييم (1-5)' : 'Score (1-5)' },
    { value: 'text', label: lang === 'ar' ? 'نص حر' : 'Free Text' },
    { value: 'photo', label: lang === 'ar' ? 'صورة مطلوبة' : 'Photo Required' },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/inspections' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Inspections</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>New Inspection Template</h1>
      </div>

      <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px', color: '#1565c0' }}>Load a vertical-specific template</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {Object.entries(DEFAULT_TEMPLATES).map(([key, tmpl]) => (
            <button key={key} type='button' onClick={() => loadTemplate(key)} style={{ padding: '6px 14px', borderRadius: 20, border: '1px solid #b3d4f5', background: 'white', cursor: 'pointer', fontSize: 12, color: '#1565c0', fontWeight: 500 }}>
              {tmpl.name}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#444' }}>Template Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required placeholder='e.g. Monthly Fire Safety Check' style={{ ...fieldStyle, fontSize: 14, padding: '8px 12px' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#444' }}>Vertical</label>
            <select value={vertical} onChange={e => setVertical(e.target.value)} style={{ ...fieldStyle, fontSize: 14, padding: '8px 12px' }}>
              <option value='general'>General</option>
              <option value='school'>School</option>
              <option value='retail'>Retail</option>
              <option value='compound'>Compound</option>
              <option value='hotel'>Hotel</option>
            </select>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#444' }}>Checklist Items ({items.length})</label>
            <button type='button' onClick={addItem} style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid #1a1a2e', background: 'white', color: '#1a1a2e', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>+ Add Item</button>
          </div>

          {items.map((item, idx) => (
            <div key={item.id} style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#999', minWidth: 20 }}>{idx + 1}.</span>
                <input value={item.label} onChange={e => updateItem(item.id, 'label', e.target.value)} placeholder='Item label (English) *' style={{ ...fieldStyle, flex: 2 }} />
                <select value={item.type} onChange={e => updateItem(item.id, 'type', e.target.value)} style={{ ...fieldStyle, flex: 1 }}>
                  {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type='checkbox' checked={item.required} onChange={e => updateItem(item.id, 'required', e.target.checked)} id={'req-' + item.id} />
                  <label htmlFor={'req-' + item.id} style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>Required</label>
                </div>
                <button type='button' onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
              </div>
              <div style={{ paddingLeft: 28 }}>
                <input value={item.label_ar} onChange={e => updateItem(item.id, 'label_ar', e.target.value)} placeholder='Item label (Arabic — optional)' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
              </div>
            </div>
          ))}
        </div>

        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? t('common.saving') : lang === 'ar' ? 'حفظ النموذج' : 'Save Template'}
        </button>
      </form>
    </div>
  )
}