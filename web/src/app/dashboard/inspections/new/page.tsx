'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { useLanguage } from '@/context/LanguageContext'

function NewInspectionForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { t, lang } = useLanguage()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [templates, setTemplates] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assets, setAssets] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spaces, setSpaces] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  const [templateId, setTemplateId] = useState(searchParams.get('template') ?? '')
  // CORE-26: cron-generated inspection WOs deep-link here with site/space pre-filled.
  const [siteId, setSiteId] = useState(searchParams.get('site') ?? '')
  const [spaceId, setSpaceId] = useState(searchParams.get('space') ?? '')
  const [assetId, setAssetId] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [orgId, setOrgId] = useState('')
  const [userId, setUserId] = useState('')
  const [step, setStep] = useState<'setup' | 'checklist'>('setup')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (templateId && templates.length > 0) {
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

  // Whenever the chosen site changes, load that site's spaces.
  useEffect(() => {
    if (!siteId) { setSpaces([]); setSpaceId(''); return }
    supabase.from('spaces').select('id, name, floor').eq('site_id', siteId).order('floor').order('name')
      // Keep a pre-filled space (deep link) if it belongs to this site; clear otherwise.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => { setSpaces(data ?? []); setSpaceId(prev => (data ?? []).some((s: any) => s.id === prev) ? prev : '') })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function setResponse(itemId: string, value: any) {
    setResponses(prev => ({ ...prev, [itemId]: value }))
  }

  function handleStartChecklist(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTemplate) { setError('Please select a template'); return }
    setError('')
    setStep('checklist')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = selectedTemplate.items ?? []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requiredItems = items.filter((item: any) => item.required)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unanswered = requiredItems.filter((item: any) => {
      const resp = responses[item.id]
      return resp === undefined || resp === null || resp === ''
    })

    if (unanswered.length > 0) {
      setError('Please answer all required items (' + unanswered.length + ' remaining)')
      setSubmitting(false)
      return
    }

    // CORE-27: an answered numeric item outside its [min, max] range counts as a fail.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const numericOutOfRange = (item: any): boolean => {
      if (item.type !== 'numeric') return false
      const raw = responses[item.id]
      if (raw === undefined || raw === null || raw === '') return false
      const v = Number(raw)
      if (Number.isNaN(v)) return false
      return (item.min != null && v < Number(item.min)) || (item.max != null && v > Number(item.max))
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const failedItems = items.filter((item: any) =>
      (item.type === 'pass_fail' && responses[item.id] === 'fail') || numericOutOfRange(item)
    )

    // Gradeable items: pass/fail buttons plus numeric items that carry a range.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passfailItems = items.filter((i: any) => i.type === 'pass_fail' || (i.type === 'numeric' && (i.min != null || i.max != null)))
    const overallResult = passfailItems.length === 0 ? 'pass' :
      failedItems.length === 0 ? 'pass' :
      failedItems.length === passfailItems.length ? 'fail' : 'partial'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responsesArray = items.map((item: any) => ({
      item_id: item.id,
      label: item.label,
      type: item.type,
      value: responses[item.id] ?? null,
      required: item.required,
      // CORE-27: keep the range + computed result so detail/PDF can render them.
      ...(item.type === 'numeric' ? {
        min: item.min ?? null,
        max: item.max ?? null,
        result: numericOutOfRange(item) ? 'fail'
          : (responses[item.id] !== undefined && responses[item.id] !== null && responses[item.id] !== '' ? 'pass' : null),
      } : {}),
    }))

    const { data: result, error: insertError } = await supabase
      .from('inspection_results')
      .insert({
        template_id: templateId,
        site_id: siteId || null,
        space_id: spaceId || null,
        asset_id: assetId || null,
        conducted_by: userId,
        organisation_id: orgId,
        status: 'completed',
        overall_result: overallResult,
        responses: responsesArray,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }

    for (const item of failedItems) {
      const numericDetail = item.type === 'numeric'
        ? ` — reading ${responses[item.id]} outside range ${item.min ?? '−∞'}–${item.max ?? '∞'}`
        : ''
      const { error: woError } = await supabase.from('work_orders').insert({
        title: 'Inspection Fail: ' + item.label,
        description: 'Auto-created from failed inspection: ' + selectedTemplate.name + numericDetail,
        priority: 'high',
        status: 'new',
        source: 'manual',
        site_id: siteId || null,
        space_id: spaceId || null,
        asset_id: assetId || null,
        organisation_id: orgId,
        created_by: userId,
      })
      if (woError) console.error('WO creation error:', woError)
    }

    // CORE-28: best-effort — email the completed-inspection PDF to the template's
    // recipients. Any failure is swallowed server-side; never blocks submission.
    try {
      await fetch('/api/inspections/' + result.id + '/distribute', { method: 'POST' })
    } catch { /* distribution is best-effort */ }

    router.push('/dashboard/inspections/' + result.id)
  }

  const fieldStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #ddd',
    borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white'
  }
  const labelStyle = {
    display: 'block' as const, marginBottom: 6,
    fontSize: 13, fontWeight: 500 as const, color: '#444'
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/inspections' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع للتفتيش' : 'Back to Inspections'}</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>
          {step === 'setup' ? t('btn.start_inspection') : selectedTemplate?.name ?? 'Inspection'}
        </h1>
        {step === 'checklist' && (
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>
            Complete all required items marked with *
          </p>
        )}
      </div>

      {step === 'setup' ? (
        <form onSubmit={handleStartChecklist} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Inspection Template *</label>
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} required style={fieldStyle}>
              <option value=''>{lang === 'ar' ? 'اختر نموذجاً' : 'Select a template'}</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.vertical ? '(' + t.vertical + ')' : ''}
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p style={{ fontSize: 12, color: '#f57f17', margin: '4px 0 0' }}>
                No templates yet. <a href='/dashboard/inspections/templates/new' style={{ color: '#1565c0' }}>Create one first.</a>
              </p>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'الموقع' : 'Site'}</label>
              <select value={siteId} onChange={e => setSiteId(e.target.value)} style={fieldStyle}>
                <option value=''>{lang === 'ar' ? 'اختر موقعاً' : 'Select site'}</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'المساحة (اختياري)' : 'Space (optional)'}</label>
              <select value={spaceId} onChange={e => setSpaceId(e.target.value)} style={fieldStyle} disabled={!siteId}>
                <option value=''>{!siteId ? (lang === 'ar' ? 'اختر موقعاً أولاً' : 'Select a site first') : (lang === 'ar' ? 'اختر مساحة' : 'Select space')}</option>
                {spaces.map(s => <option key={s.id} value={s.id}>{s.floor ? s.floor + ' · ' : ''}{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{lang === 'ar' ? 'الأصل (اختياري)' : 'Asset (optional)'}</label>
              <select value={assetId} onChange={e => setAssetId(e.target.value)} style={fieldStyle}>
                <option value=''>{lang === 'ar' ? 'اختر أصلاً' : 'Select asset'}</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>

          {selectedTemplate && (
            <div style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px 16px' }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 4px' }}>{selectedTemplate.name}</p>
              <p style={{ fontSize: 12, color: '#999', margin: 0 }}>
                {(selectedTemplate.items ?? []).length} checklist items ·
                {selectedTemplate.vertical ? ' ' + selectedTemplate.vertical.charAt(0).toUpperCase() + selectedTemplate.vertical.slice(1) : ' General'}
              </p>
            </div>
          )}

          {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}

          <button type='submit' disabled={!templateId} style={{ background: '#1a1a2e', color: 'white', padding: '12px', borderRadius: 8, border: 'none', cursor: templateId ? 'pointer' : 'not-allowed', fontWeight: 500, fontSize: 15, opacity: templateId ? 1 : 0.7 }}>
            Begin Checklist →
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: '#f9f9f9', borderRadius: 8, padding: '10px 14px', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
              {siteId ? sites.find(s => s.id === siteId)?.name : 'No site'} ·
              {assetId ? ' ' + assets.find(a => a.id === assetId)?.name : ' No asset'}
            </p>
            <button type='button' onClick={() => setStep('setup')} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 12 }}>{lang === 'ar' ? 'تغيير الإعداد' : '← Change setup'}</button>
          </div>

          <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(selectedTemplate?.items ?? []).map((item: any, idx: number) => (
              <div key={item.id} style={{ padding: '16px', borderBottom: '1px solid #f5f5f5', background: responses[item.id] === 'fail' ? '#fff8f8' : 'white' }}>
                <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 10px' }}>
                  {idx + 1}. {item.label}
                  {item.required && <span style={{ color: '#c62828', marginLeft: 4 }}>*</span>}
                </p>
                {item.label_ar && (
                  <p style={{ fontSize: 12, color: '#999', margin: '-6px 0 10px', direction: 'rtl', textAlign: 'right' }}>{item.label_ar}</p>
                )}

                {item.type === 'pass_fail' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['pass', 'fail'].map(v => (
                      <button key={v} type='button' onClick={() => setResponse(item.id, v)}
                        style={{
                          padding: '8px 24px', borderRadius: 8,
                          border: '2px solid ' + (responses[item.id] === v ? (v === 'pass' ? '#2e7d32' : '#c62828') : '#ddd'),
                          background: responses[item.id] === v ? (v === 'pass' ? '#e8f5e9' : '#fce4ec') : 'white',
                          color: responses[item.id] === v ? (v === 'pass' ? '#2e7d32' : '#c62828') : '#666',
                          cursor: 'pointer', fontSize: 14, fontWeight: 600,
                        }}>
                        {v === 'pass' ? '✓ Pass' : '✗ Fail'}
                      </button>
                    ))}
                  </div>
                )}

                {item.type === 'yes_no' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['yes', 'no'].map(v => (
                      <button key={v} type='button' onClick={() => setResponse(item.id, v)}
                        style={{
                          padding: '8px 24px', borderRadius: 8,
                          border: '2px solid ' + (responses[item.id] === v ? '#283593' : '#ddd'),
                          background: responses[item.id] === v ? '#e8eaf6' : 'white',
                          color: responses[item.id] === v ? '#283593' : '#666',
                          cursor: 'pointer', fontSize: 14, fontWeight: 600,
                        }}>
                        {v === 'yes' ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                )}

                {item.type === 'score' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[1,2,3,4,5].map(v => (
                      <button key={v} type='button' onClick={() => setResponse(item.id, v)}
                        style={{
                          width: 44, height: 44, borderRadius: 8,
                          border: '2px solid ' + (responses[item.id] === v ? '#1a1a2e' : '#ddd'),
                          background: responses[item.id] === v ? '#1a1a2e' : 'white',
                          color: responses[item.id] === v ? 'white' : '#666',
                          cursor: 'pointer', fontSize: 15, fontWeight: 700,
                        }}>
                        {v}
                      </button>
                    ))}
                  </div>
                )}

                {item.type === 'text' && (
                  <input
                    value={responses[item.id] ?? ''}
                    onChange={e => setResponse(item.id, e.target.value)}
                    placeholder='Enter value...'
                    style={fieldStyle}
                  />
                )}

                {item.type === 'numeric' && (() => {
                  const raw = responses[item.id]
                  const v = raw === undefined || raw === null || raw === '' ? null : Number(raw)
                  const outOfRange = v !== null && !Number.isNaN(v) &&
                    ((item.min != null && v < Number(item.min)) || (item.max != null && v > Number(item.max)))
                  return (
                    <div>
                      <input
                        type='number' step='any'
                        value={raw ?? ''}
                        onChange={e => setResponse(item.id, e.target.value)}
                        placeholder={lang === 'ar' ? 'أدخل القراءة...' : 'Enter reading...'}
                        style={{ ...fieldStyle, borderColor: outOfRange ? '#c62828' : '#ddd' }}
                      />
                      {(item.min != null || item.max != null) && (
                        <p style={{ fontSize: 12, margin: '6px 0 0', color: outOfRange ? '#c62828' : '#999' }}>
                          {lang === 'ar' ? 'النطاق المقبول: ' : 'Acceptable range: '}
                          {item.min ?? '−∞'} – {item.max ?? '∞'}
                          {outOfRange && (lang === 'ar' ? ' — خارج النطاق، سيُعد فاشلاً' : ' — out of range, will be marked as failed')}
                        </p>
                      )}
                    </div>
                  )
                })()}

                {item.type === 'date' && (
                  <input
                    type='date'
                    value={responses[item.id] ?? ''}
                    onChange={e => setResponse(item.id, e.target.value)}
                    style={fieldStyle}
                  />
                )}

                {item.type === 'photo' && (
                  <p style={{ fontSize: 12, color: '#f57f17', margin: 0, background: '#fff8e1', padding: '6px 10px', borderRadius: 6 }}>
                    Photo upload available after submission
                  </p>
                )}
              </div>
            ))}
          </div>

          {error && (
            <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b71c1c' }}>
              {error}
            </div>
          )}

          <button type='submit' disabled={submitting}
            style={{ background: '#1a1a2e', color: 'white', padding: '12px', borderRadius: 8, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? t('common.saving') : lang === 'ar' ? 'تقديم التفتيش' : 'Submit Inspection'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function NewInspectionPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <NewInspectionForm />
    </Suspense>
  )
}