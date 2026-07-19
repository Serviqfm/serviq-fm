'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'
import WorkOrderCustomFields from '@/components/WorkOrderCustomFields'
import { fetchWoCategories, catLabel, type WoCategory } from '@/lib/woCategories'

export default function EditWorkOrderPage() {
  const router = useRouter()
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] || ''
  const { lang } = useLanguage()
  const supabase = createClient()
  const { isHidden, isRequired, loading: configLoading } = useFieldConfig('work_orders_edit')
  const isReq = (key: string) => isRequired(key) || isSystemRequired('work_orders_edit', key)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assets, setAssets] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [technicians, setTechnicians] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [vendors, setVendors] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [teams, setTeams] = useState<any[]>([])
  const [additionalWorkers, setAdditionalWorkers] = useState<string[]>([])
  // 1C-06/WO-28: snapshot of team + workers at load so we only notify newly-added
  // recipients on save (re-saving an unchanged WO must not re-notify).
  const origAssignRef = useRef<{ teamId: string; workers: string[] }>({ teamId: '', workers: [] })
  const [isManager, setIsManager] = useState(false)
  const [customFields, setCustomFields] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<WoCategory[]>([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    category: '',
    site_id: '',
    asset_id: '',
    assigned_to: '',
    team_id: '',
    due_at: '',
    start_at: '',
    sla_hours: '',
    completion_notes: '',
    actual_cost: '',
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [id])

  async function loadData() {
    try {
      if (!id) {
        setError('No work order ID provided')
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const { data: profile, error: profileErr } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
      if (profileErr || !profile) {
        setError('Failed to load user profile')
        setLoading(false)
        return
      }
      const orgId = profile.organisation_id
      setIsManager(profile.role === 'admin' || profile.role === 'manager')

      const [woResult, assetResult, siteResult, techResult, vendorResult, teamResult] = await Promise.all([
        supabase.from('work_orders').select('*').eq('id', id).single(),
        supabase.from('assets').select('id, name, site_id').eq('organisation_id', orgId).eq('status', 'active'),
        supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
        supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
        supabase.from('vendors').select('id, company_name').eq('organisation_id', orgId).eq('is_active', true),
        supabase.from('teams').select('id, name, name_ar').eq('organisation_id', orgId).order('name'),
      ])

      if (woResult.error) {
        console.error('Error loading work order:', woResult.error)
        setError(`Failed to load work order: ${woResult.error.message}`)
        setLoading(false)
        return
      }

      if (!woResult.data) {
        setError('Work order not found')
        setLoading(false)
        return
      }

      setCategories(await fetchWoCategories(supabase))
      if (assetResult.data) setAssets(assetResult.data)
      if (siteResult.data) setSites(siteResult.data)
      if (techResult.data) setTechnicians(techResult.data)
      if (vendorResult.data) setVendors(vendorResult.data)
      if (teamResult.data) setTeams(teamResult.data)

      const wo = woResult.data
      setForm({
        title: wo.title ?? '',
        description: wo.description ?? '',
        priority: wo.priority ?? 'medium',
        category: wo.category ?? '',
        site_id: wo.site_id ?? '',
        asset_id: wo.asset_id ?? '',
        assigned_to: wo.assigned_to ?? wo.assigned_vendor_id ?? '',
        team_id: wo.team_id ?? '',
        due_at: wo.due_at ? wo.due_at.slice(0, 16) : '',
        start_at: wo.start_at ? wo.start_at.slice(0, 16) : '',
        sla_hours: wo.sla_hours ? String(wo.sla_hours) : '',
        completion_notes: wo.completion_notes ?? '',
        actual_cost: wo.actual_cost ? String(wo.actual_cost) : '',
      })
      setAdditionalWorkers(Array.isArray(wo.additional_workers) ? wo.additional_workers : [])
      origAssignRef.current = {
        teamId: wo.team_id ?? '',
        workers: Array.isArray(wo.additional_workers) ? wo.additional_workers : [],
      }
      // WO-26: custom_fields JSONB → string map (coerce any stored value to string).
      if (wo.custom_fields && typeof wo.custom_fields === 'object') {
        setCustomFields(Object.fromEntries(
          Object.entries(wo.custom_fields as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)])
        ))
      }
      setLoading(false)
    } catch (err) {
      console.error('Unexpected error in loadData:', err)
      setError(err instanceof Error ? err.message : 'Unexpected error loading work order')
      setLoading(false)
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setForm(prev => {
      const next = { ...prev, [name]: value }
      // WO-29: picking an asset auto-fills its site; switching site clears a
      // mismatched asset (the asset dropdown only offers the selected site's assets).
      if (name === 'asset_id') {
        const asset = assets.find(a => a.id === value)
        if (asset?.site_id) next.site_id = asset.site_id
      }
      if (name === 'site_id' && value) {
        const asset = assets.find(a => a.id === next.asset_id)
        if (asset?.site_id && asset.site_id !== value) next.asset_id = ''
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    // DV-12: the assign dropdown mixes users and vendors. Route a vendor pick to
    // assigned_vendor_id and keep assigned_to users-only.
    const isVendor = vendors.some(v => v.id === form.assigned_to)
    const res = await fetch(`/api/work-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        description: form.description,
        priority: form.priority,
        category: form.category,
        site_id: form.site_id,
        asset_id: form.asset_id,
        assigned_to: isVendor ? '' : form.assigned_to,
        assigned_vendor_id: isVendor ? form.assigned_to : '',
        due_at: form.due_at,
        sla_hours: form.sla_hours,
        completion_notes: form.completion_notes,
        actual_cost: form.actual_cost,
      }),
    })
    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(result?.error ?? 'Failed to update work order')
      setSaving(false)
      return
    }
    const updatedWO = result.work_order ? [result.work_order] : []

    // Team and additional workers are not in the PATCH whitelist — save them
    // client-side after the PATCH succeeds (org-scoped RLS update). CORE-20:
    // assignment is manager-only, so only managers/admins write these (the fields
    // are hidden for everyone else, and the DB trigger blocks non-manager
    // worker-list changes as the durable backstop).
    if (isManager) {
      await supabase.from('work_orders').update({
        team_id: form.team_id ? form.team_id : null,
        additional_workers: additionalWorkers.filter(uid => uid !== form.assigned_to),
      }).eq('id', id)
    }

    // WO-31 + WO-26: planned start + custom fields aren't in the PATCH whitelist —
    // save them via an org-scoped RLS update (any user allowed to edit this WO).
    await supabase.from('work_orders').update({
      start_at: form.start_at ? form.start_at : null,
      custom_fields: Object.fromEntries(Object.entries(customFields).filter(([, v]) => v !== '')),
    }).eq('id', id)

    // Send assignment notifications via API (keeps server-side imports server-side).
    // The route resolves every recipient (single assignee, team members, added
    // workers) server-side, org-scoped and active-only (1C-06/1C-07/WO-28). We only
    // send the team/worker deltas that changed, so a re-save doesn't re-notify.
    try {
      const wo = updatedWO[0]
      const woNumber = wo?.wo_number
        ? `WO-${String(wo.wo_number).padStart(4, '0')}`
        : id.slice(0, 8)

      // Vendors have no user account — only notify a real user assignee.
      const assigneeId = form.assigned_to && !isVendor ? form.assigned_to : undefined
      // Notify the team only when it's newly set/changed on this save.
      const newTeamId = isManager && form.team_id && form.team_id !== origAssignRef.current.teamId
        ? form.team_id : undefined
      // Notify only workers added on this save (exclude the assignee — they get their own).
      const savedWorkers = isManager
        ? additionalWorkers.filter(uid => uid !== form.assigned_to)
        : []
      const newWorkerIds = savedWorkers.filter(uid => !origAssignRef.current.workers.includes(uid))

      if (assigneeId || newTeamId || newWorkerIds.length > 0) {
        fetch('/api/notifications/wo-assigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: assigneeId,
            teamId: newTeamId,
            additionalWorkerIds: newWorkerIds,
            assignedBy: 'Manager',
            woNumber,
            woTitle: form.title,
            woId: id,
          }),
        }).catch(console.error)
      }
    } catch (err) {
      console.error('Failed to send assignment notification:', err)
    }

    router.push('/dashboard/work-orders/' + id)
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (loading || configLoading) return <div style={{ padding: '2rem' }}>Loading...</div>

  const reqMark = (key: string) => isReq(key) ? <span style={{ color: '#d32f2f' }}> *</span> : null

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href={'/dashboard/work-orders/' + id} style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Work Order</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Edit Work Order</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {!isHidden('title') && (
          <div>
            <label style={labelStyle}>Title{reqMark('title')}</label>
            <input name='title' value={form.title} onChange={handleChange} required={isReq('title')} style={fieldStyle} />
          </div>
        )}
        {!isHidden('description') && (
          <div>
            <label style={labelStyle}>Description{reqMark('description')}</label>
            <textarea name='description' value={form.description} onChange={handleChange} rows={3}
              required={isReq('description')}
              style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('priority') && (
            <div>
              <label style={labelStyle}>Priority{reqMark('priority')}</label>
              <select name='priority' value={form.priority} onChange={handleChange} required={isReq('priority')} style={fieldStyle}>
                <option value='low'>Low</option>
                <option value='medium'>Medium</option>
                <option value='high'>High</option>
                <option value='critical'>Critical</option>
              </select>
            </div>
          )}
          {!isHidden('category') && (
            <div>
              <label style={labelStyle}>Category{reqMark('category')}</label>
              <select name='category' value={form.category} onChange={handleChange} required={isReq('category')} style={fieldStyle}>
                <option value=''>Select category</option>
                {categories.map(c => (
                  <option key={c.name} value={c.name}>{catLabel(c, lang)}</option>
                ))}
                {form.category && !categories.some(c => c.name === form.category) && (
                  <option value={form.category}>{form.category}</option>
                )}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('site_id') && (
            <div>
              <label style={labelStyle}>Site{reqMark('site_id')}</label>
              <select name='site_id' value={form.site_id} onChange={handleChange} required={isReq('site_id')} style={fieldStyle}>
                <option value=''>Select site</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {!isHidden('asset_id') && (
            <div>
              <label style={labelStyle}>Asset{reqMark('asset_id')}</label>
              <select name='asset_id' value={form.asset_id} onChange={handleChange} required={isReq('asset_id')} style={fieldStyle}>
                <option value=''>Select asset</option>
                {/* WO-29: once a site is chosen, only its assets are offered. */}
                {assets.filter(a => !form.site_id || !a.site_id || a.site_id === form.site_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('assigned_to') && (
            <div>
              <label style={labelStyle}>Assign To{reqMark('assigned_to')}</label>
              <select name='assigned_to' value={form.assigned_to} onChange={handleChange} required={isReq('assigned_to')} style={fieldStyle}>
                <option value=''>Unassigned</option>
                {technicians.length > 0 && <optgroup label='Internal Technicians'>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </optgroup>}
                {vendors.length > 0 && <optgroup label='External Vendors'>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.company_name}</option>)}
                </optgroup>}
              </select>
            </div>
          )}
          {!isHidden('sla_hours') && (
            <div>
              <label style={labelStyle}>SLA (hours){reqMark('sla_hours')}</label>
              <input name='sla_hours' type='number' value={form.sla_hours} onChange={handleChange}
                required={isReq('sla_hours')}
                placeholder='e.g. 24' style={fieldStyle} />
            </div>
          )}
        </div>
        {isManager && teams.length > 0 && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'الفريق (اختياري)' : 'Team (optional)'}</label>
            <select name='team_id' value={form.team_id} onChange={handleChange} style={fieldStyle}>
              <option value=''>{lang === 'ar' ? 'بدون فريق' : 'No team'}</option>
              {teams.map(tm => (
                <option key={tm.id} value={tm.id}>{lang === 'ar' && tm.name_ar ? tm.name_ar : tm.name}</option>
              ))}
            </select>
          </div>
        )}
        {isManager && technicians.filter(tech => tech.id !== form.assigned_to).length > 0 && (
          <div>
            <label style={labelStyle}>
              {lang === 'ar' ? 'عمال إضافيون' : 'Additional Workers'}
              {' '}
              <span style={{ fontWeight: 400, color: '#888' }}>
                ({additionalWorkers.filter(uid => uid !== form.assigned_to).length} {lang === 'ar' ? 'محدد' : 'selected'})
              </span>
            </label>
            <div style={{ border: '1px solid #ddd', borderRadius: 8, background: 'white', padding: '8px 12px', maxHeight: 180, overflowY: 'auto' }}>
              {technicians.filter(tech => tech.id !== form.assigned_to).map(tech => (
                <label key={tech.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type='checkbox'
                    checked={additionalWorkers.includes(tech.id)}
                    onChange={() => setAdditionalWorkers(prev => prev.includes(tech.id) ? prev.filter(uid => uid !== tech.id) : [...prev, tech.id])}
                    style={{ cursor: 'pointer' }}
                  />
                  {tech.full_name}
                </label>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {!isHidden('due_at') && (
            <div>
              <label style={labelStyle}>Due Date{reqMark('due_at')}</label>
              <input name='due_at' type='datetime-local' value={form.due_at} onChange={handleChange}
                required={isReq('due_at')}
                style={fieldStyle} />
            </div>
          )}
          {!isHidden('actual_cost') && (
            <div>
              <label style={labelStyle}>Actual Cost (SAR){reqMark('actual_cost')}</label>
              <input name='actual_cost' type='number' value={form.actual_cost} onChange={handleChange}
                required={isReq('actual_cost')}
                placeholder='e.g. 500' style={fieldStyle} />
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'تاريخ البدء المخطط' : 'Planned Start Date'}</label>
          <input name='start_at' type='datetime-local' value={form.start_at} onChange={handleChange} style={fieldStyle} />
        </div>
        {!isHidden('completion_notes') && (
          <div>
            <label style={labelStyle}>Completion Notes{reqMark('completion_notes')}</label>
            <textarea name='completion_notes' value={form.completion_notes} onChange={handleChange} rows={3}
              required={isReq('completion_notes')}
              placeholder='Notes on how the issue was resolved...' style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>
        )}
        <WorkOrderCustomFields values={customFields} onChange={setCustomFields} />
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type='submit' disabled={saving} style={{ flex: 1, background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <a href={'/dashboard/work-orders/' + id} style={{ flex: 1 }}>
            <button type='button' style={{ width: '100%', background: 'white', color: '#333', padding: '11px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', fontWeight: 500, fontSize: 15 }}>
              Cancel
            </button>
          </a>
        </div>
      </form>
    </div>
  )
}