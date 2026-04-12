import os

# ── 1. Inspections list page ──
inspections_list = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'inspections' | 'templates'>('inspections')
  const supabase = createClient()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id
    const [{ data: insp }, { data: tmpl }] = await Promise.all([
      supabase.from('inspection_results').select('*, template:template_id(name, vertical), conductor:conducted_by(full_name), site:site_id(name), asset:asset_id(name)').eq('organisation_id', orgId).order('created_at', { ascending: false }),
      supabase.from('inspection_templates').select('*').eq('organisation_id', orgId).order('created_at', { ascending: false }),
    ])
    if (insp) setInspections(insp)
    if (tmpl) setTemplates(tmpl)
    setLoading(false)
  }

  const resultConfig: Record<string, { bg: string; color: string; label: string }> = {
    pass:    { bg: '#e8f5e9', color: '#2e7d32', label: 'Pass' },
    fail:    { bg: '#fce4ec', color: '#b71c1c', label: 'Fail' },
    partial: { bg: '#fff8e1', color: '#f57f17', label: 'Partial' },
  }

  const statusConfig: Record<string, { bg: string; color: string }> = {
    in_progress: { bg: '#fff8e1', color: '#f57f17' },
    completed:   { bg: '#e8f5e9', color: '#2e7d32' },
    failed:      { bg: '#fce4ec', color: '#b71c1c' },
  }

  const verticalColors: Record<string, string> = {
    school: '#e3f2fd', retail: '#e8f5e9', compound: '#fff8e1', hotel: '#fce4ec', general: '#f3e5f5',
  }

  const tabStyle = (active: boolean) => ({
    padding: '8px 20px', border: 'none',
    borderBottom: active ? '2px solid #1a1a2e' : '2px solid transparent',
    background: 'transparent', cursor: 'pointer',
    fontSize: 14, fontWeight: (active ? 600 : 400) as any,
    color: active ? '#1a1a2e' : '#999',
  })

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Inspections</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{inspections.length} inspections · {templates.length} templates</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href='/dashboard/inspections/templates/new'>
            <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>+ New Template</button>
          </Link>
          <Link href='/dashboard/inspections/new'>
            <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>+ Start Inspection</button>
          </Link>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #eee', marginBottom: '1.5rem', display: 'flex' }}>
        <button style={tabStyle(activeTab === 'inspections')} onClick={() => setActiveTab('inspections')}>Inspections ({inspections.length})</button>
        <button style={tabStyle(activeTab === 'templates')} onClick={() => setActiveTab('templates')}>Templates ({templates.length})</button>
      </div>

      {loading ? <p style={{ color: '#999' }}>Loading...</p> : activeTab === 'inspections' ? (
        inspections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
            <p style={{ fontSize: 18, marginBottom: 8 }}>No inspections yet</p>
            <p style={{ fontSize: 14 }}>Start your first inspection using a template</p>
          </div>
        ) : (
          <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                  {['Template','Vertical','Site','Asset','Conducted By','Result','Status','Date'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspections.map((insp, i) => {
                  const rCfg = insp.overall_result ? resultConfig[insp.overall_result] : null
                  const sCfg = statusConfig[insp.status] ?? statusConfig.in_progress
                  return (
                    <tr key={insp.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <Link href={'/dashboard/inspections/' + insp.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>
                          {insp.template?.name ?? 'Unknown'}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {insp.template?.vertical && (
                          <span style={{ background: verticalColors[insp.template.vertical] ?? '#f5f5f5', color: '#333', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                            {insp.template.vertical.charAt(0).toUpperCase() + insp.template.vertical.slice(1)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{insp.site?.name ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{insp.asset?.name ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{insp.conductor?.full_name ?? '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {rCfg ? <span style={{ background: rCfg.bg, color: rCfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>{rCfg.label}</span> : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: sCfg.bg, color: sCfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                          {insp.status.replace('_', ' ').replace(/\\b\\w/g, (l: string) => l.toUpperCase())}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{format(new Date(insp.created_at), 'dd MMM yyyy')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        templates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
            <p style={{ fontSize: 18, marginBottom: 8 }}>No templates yet</p>
            <p style={{ fontSize: 14 }}>Create a template to start running inspections</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {templates.map(t => (
              <div key={t.id} style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{t.name}</p>
                  {t.vertical && (
                    <span style={{ background: verticalColors[t.vertical] ?? '#f5f5f5', color: '#333', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 500 }}>
                      {t.vertical.charAt(0).toUpperCase() + t.vertical.slice(1)}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: '#999', margin: '0 0 12px' }}>{(t.items ?? []).length} checklist items</p>
                {t.is_default && <span style={{ fontSize: 11, background: '#e8eaf6', color: '#283593', padding: '2px 8px', borderRadius: 6 }}>Default template</span>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <Link href={'/dashboard/inspections/new?template=' + t.id} style={{ flex: 1 }}>
                    <button style={{ width: '100%', padding: '7px', borderRadius: 7, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>Use Template</button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}"""

# ── 2. New Template page ──
templates_new = """'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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
    { value: 'pass_fail', label: 'Pass / Fail' },
    { value: 'yes_no', label: 'Yes / No' },
    { value: 'score', label: 'Score (1-5)' },
    { value: 'text', label: 'Free Text' },
    { value: 'photo', label: 'Photo Required' },
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
          {loading ? 'Saving...' : 'Save Template'}
        </button>
      </form>
    </div>
  )
}"""

# ── 3. Start Inspection page ──
inspection_new = """'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function NewInspectionForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [templates, setTemplates] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  const [templateId, setTemplateId] = useState(searchParams.get('template') ?? '')
  const [siteId, setSiteId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [orgId, setOrgId] = useState('')
  const [userId, setUserId] = useState('')

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    if (templateId) {
      const tmpl = templates.find(t => t.id === templateId)
      setSelectedTemplate(tmpl ?? null)
    } else {
      setSelectedTemplate(null)
    }
  }, [templateId, templates])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    setOrgId(profile.organisation_id)
    const [{ data: tmpl }, { data: siteData }, { data: assetData }] = await Promise.all([
      supabase.from('inspection_templates').select('*').eq('organisation_id', profile.organisation_id),
      supabase.from('sites').select('id, name').eq('organisation_id', profile.organisation_id).eq('is_active', true),
      supabase.from('assets').select('id, name').eq('organisation_id', profile.organisation_id).eq('status', 'active'),
    ])
    if (tmpl) setTemplates(tmpl)
    if (siteData) setSites(siteData)
    if (assetData) setAssets(assetData)
    setLoading(false)
  }

  function setResponse(itemId: string, value: any) {
    setResponses(prev => ({ ...prev, [itemId]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTemplate) { setError('Please select a template'); return }
    setSubmitting(true)
    setError('')

    const items = selectedTemplate.items ?? []
    const failedItems = items.filter((item: any) => {
      const resp = responses[item.id]
      return item.type === 'pass_fail' && (resp === 'fail' || resp === false)
    })

    const overallResult = failedItems.length === 0 ? 'pass' : failedItems.length === items.filter((i: any) => i.type === 'pass_fail').length ? 'fail' : 'partial'

    const responsesArray = items.map((item: any) => ({
      item_id: item.id,
      label: item.label,
      type: item.type,
      value: responses[item.id] ?? null,
      required: item.required,
    }))

    const { data: result, error: insertError } = await supabase.from('inspection_results').insert({
      template_id: templateId,
      site_id: siteId || null,
      asset_id: assetId || null,
      conducted_by: userId,
      organisation_id: orgId,
      status: 'completed',
      overall_result: overallResult,
      responses: responsesArray,
      completed_at: new Date().toISOString(),
    }).select().single()

    if (insertError) { setError(insertError.message); setSubmitting(false); return }

    // Auto-create WOs for failed items
    for (const item of failedItems) {
      await supabase.from('work_orders').insert({
        title: 'Inspection Fail: ' + item.label,
        description: 'Auto-created from inspection: ' + selectedTemplate.name,
        priority: 'high',
        status: 'new',
        source: 'inspection',
        site_id: siteId || null,
        asset_id: assetId || null,
        organisation_id: orgId,
        created_by: userId,
      })
    }

    router.push('/dashboard/inspections/' + result.id)
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/inspections' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Inspections</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Start Inspection</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Inspection Template *</label>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)} required style={fieldStyle}>
            <option value=''>Select a template</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name} {t.vertical ? '(' + t.vertical + ')' : ''}</option>)}
          </select>
          {templates.length === 0 && (
            <p style={{ fontSize: 12, color: '#f57f17', margin: '4px 0 0' }}>No templates yet. <a href='/dashboard/inspections/templates/new' style={{ color: '#1565c0' }}>Create one first.</a></p>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Site</label>
            <select value={siteId} onChange={e => setSiteId(e.target.value)} style={fieldStyle}>
              <option value=''>Select site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Asset (optional)</label>
            <select value={assetId} onChange={e => setAssetId(e.target.value)} style={fieldStyle}>
              <option value=''>Select asset</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {selectedTemplate && (
          <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#f9f9f9', padding: '12px 16px', borderBottom: '1px solid #eee' }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{selectedTemplate.name}</p>
              <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>{(selectedTemplate.items ?? []).length} items to complete</p>
            </div>
            {(selectedTemplate.items ?? []).map((item: any, idx: number) => (
              <div key={item.id} style={{ padding: '14px 16px', borderBottom: '1px solid #f5f5f5', background: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>
                      {idx + 1}. {item.label}
                      {item.required && <span style={{ color: '#c62828', marginLeft: 4 }}>*</span>}
                    </p>
                    {item.label_ar && <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0', direction: 'rtl' }}>{item.label_ar}</p>}
                  </div>
                </div>
                {item.type === 'pass_fail' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['pass', 'fail'].map(v => (
                      <button key={v} type='button' onClick={() => setResponse(item.id, v)} style={{ padding: '6px 20px', borderRadius: 7, border: '2px solid ' + (responses[item.id] === v ? (v === 'pass' ? '#2e7d32' : '#c62828') : '#ddd'), background: responses[item.id] === v ? (v === 'pass' ? '#e8f5e9' : '#fce4ec') : 'white', color: responses[item.id] === v ? (v === 'pass' ? '#2e7d32' : '#c62828') : '#666', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                        {v === 'pass' ? 'Pass' : 'Fail'}
                      </button>
                    ))}
                  </div>
                )}
                {item.type === 'yes_no' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['yes', 'no'].map(v => (
                      <button key={v} type='button' onClick={() => setResponse(item.id, v)} style={{ padding: '6px 20px', borderRadius: 7, border: '2px solid ' + (responses[item.id] === v ? '#283593' : '#ddd'), background: responses[item.id] === v ? '#e8eaf6' : 'white', color: responses[item.id] === v ? '#283593' : '#666', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                        {v === 'yes' ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                )}
                {item.type === 'score' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1,2,3,4,5].map(v => (
                      <button key={v} type='button' onClick={() => setResponse(item.id, v)} style={{ width: 36, height: 36, borderRadius: 7, border: '2px solid ' + (responses[item.id] === v ? '#1a1a2e' : '#ddd'), background: responses[item.id] === v ? '#1a1a2e' : 'white', color: responses[item.id] === v ? 'white' : '#666', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {v}
                      </button>
                    ))}
                  </div>
                )}
                {item.type === 'text' && (
                  <input value={responses[item.id] ?? ''} onChange={e => setResponse(item.id, e.target.value)} placeholder='Enter value...' style={{ ...fieldStyle, fontSize: 13 }} />
                )}
                {item.type === 'photo' && (
                  <p style={{ fontSize: 12, color: '#f57f17', margin: 0 }}>Photo upload available after submission</p>
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}

        <button type='submit' disabled={submitting || !templateId} style={{ background: '#1a1a2e', color: 'white', padding: '12px', borderRadius: 8, border: 'none', cursor: submitting || !templateId ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: submitting || !templateId ? 0.7 : 1 }}>
          {submitting ? 'Submitting...' : 'Submit Inspection'}
        </button>
      </form>
    </div>
  )
}

export default function NewInspectionPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <NewInspectionForm />
    </Suspense>
  )
}"""

# ── 4. Inspection detail/result page ──
inspection_detail = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function InspectionDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const [inspection, setInspection] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchInspection() }, [id])

  async function fetchInspection() {
    const { data } = await supabase
      .from('inspection_results')
      .select('*, template:template_id(name, vertical, items), conductor:conducted_by(full_name), site:site_id(name), asset:asset_id(name)')
      .eq('id', id)
      .single()
    if (data) setInspection(data)
    setLoading(false)
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!inspection) return <div style={{ padding: '2rem' }}>Inspection not found.</div>

  const responses: any[] = inspection.responses ?? []
  const items: any[] = inspection.template?.items ?? []
  const failedItems = responses.filter(r => r.value === 'fail')

  const resultConfig: Record<string, { bg: string; color: string; label: string }> = {
    pass:    { bg: '#e8f5e9', color: '#2e7d32', label: 'Overall Pass' },
    fail:    { bg: '#fce4ec', color: '#b71c1c', label: 'Overall Fail' },
    partial: { bg: '#fff8e1', color: '#f57f17', label: 'Partial Pass' },
  }

  const rCfg = inspection.overall_result ? resultConfig[inspection.overall_result] : null

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <a href='/dashboard/inspections' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Inspections</a>
        <button onClick={() => window.print()} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 13 }}>Export PDF</button>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{inspection.template?.name}</h1>
          {rCfg && <span style={{ background: rCfg.bg, color: rCfg.color, padding: '3px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>{rCfg.label}</span>}
        </div>
        <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>
          Conducted by {inspection.conductor?.full_name ?? '—'} · {format(new Date(inspection.created_at), 'dd MMM yyyy, HH:mm')}
          {inspection.site?.name && ' · ' + inspection.site.name}
          {inspection.asset?.name && ' · ' + inspection.asset.name}
        </p>
      </div>

      {failedItems.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#b71c1c', margin: '0 0 8px' }}>
            {failedItems.length} failed item{failedItems.length > 1 ? 's' : ''} — work orders created automatically
          </p>
          {failedItems.map((r, i) => (
            <p key={i} style={{ fontSize: 13, color: '#c62828', margin: '0 0 4px' }}>• {r.label}</p>
          ))}
        </div>
      )}

      <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
        {responses.map((r, i) => {
          const isFail = r.value === 'fail'
          const isPass = r.value === 'pass'
          return (
            <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid #f5f5f5', background: isFail ? '#fff8f8' : 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>{i + 1}. {r.label}</p>
                <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>{r.type.replace('_', '/')}</p>
              </div>
              <div>
                {r.value !== null && r.value !== undefined && r.value !== '' ? (
                  <span style={{
                    padding: '3px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: isFail ? '#fce4ec' : isPass ? '#e8f5e9' : '#e8eaf6',
                    color: isFail ? '#b71c1c' : isPass ? '#2e7d32' : '#283593',
                  }}>
                    {String(r.value).charAt(0).toUpperCase() + String(r.value).slice(1)}
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: '#bbb' }}>Not answered</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', gap: 10 }}>
        <Link href='/dashboard/inspections/new'>
          <button style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Start New Inspection</button>
        </Link>
        <Link href='/dashboard/work-orders'>
          <button style={{ padding: '8px 20px', background: 'white', color: '#1a1a2e', border: '1px solid #1a1a2e', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>View Work Orders</button>
        </Link>
      </div>
    </div>
  )
}"""

# Write all files
with open('src/app/dashboard/inspections/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inspections_list)
print('inspections/page.tsx written')

with open('src/app/dashboard/inspections/templates/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(templates_new)
print('inspections/templates/new/page.tsx written')

with open('src/app/dashboard/inspections/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inspection_new)
print('inspections/new/page.tsx written')

with open('src/app/dashboard/inspections/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inspection_detail)
print('inspections/[id]/page.tsx written')

print('All inspection files written successfully')