'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, differenceInDays } from 'date-fns'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import TranslateButton from '@/components/TranslateButton'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, primaryBtn, secondaryBtn, inputStyle, pageStyle } from '@/lib/brand'

export default function AssetDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const [asset, setAsset] = useState<any>(null)
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [pmSchedules, setPmSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [translatedAsset, setTranslatedAsset] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'details' | 'workorders' | 'pm' | 'photos' | 'qr' | 'custom' | 'pmhistory'>('details')
  const [pmHistory, setPmHistory] = useState<any[]>([])

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    const [{ data: assetData }, { data: woData }, { data: pmData }] = await Promise.all([
      supabase.from('assets').select('*, site:site_id(name)').eq('id', id).single(),
      supabase.from('work_orders').select('*, assignee:assigned_to(full_name)').eq('asset_id', id).order('created_at', { ascending: false }),
      supabase.from('pm_schedules').select('*, assignee:assigned_to(full_name)').eq('asset_id', id).order('created_at', { ascending: false }),
    ])
    if (assetData) setAsset(assetData)
    if (woData) setWorkOrders(woData)
    if (pmData) setPmSchedules(pmData)
    setLoading(false)
  }

  async function updateStatus(newStatus: string) {
    await supabase.from('assets').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
    fetchAll()
  }

  if (loading) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>Loading...</div>
  if (!asset) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>Asset not found.</div>

  const warrantyDaysLeft = asset.warranty_expiry ? differenceInDays(new Date(asset.warranty_expiry), new Date()) : null
  const warrantyExpired = warrantyDaysLeft !== null && warrantyDaysLeft < 0
  const warrantySoon = warrantyDaysLeft !== null && warrantyDaysLeft >= 0 && warrantyDaysLeft <= 30

  const lifecycleCost = workOrders
    .filter(w => w.status === 'closed')
    .reduce((sum: number, w: any) => sum + (w.actual_cost || 0), 0)

  const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
    active:            { bg: '#DCFCE7', color: C.success, label: t('assets.status.active') },
    under_maintenance: { bg: '#FEF3C7', color: C.warning, label: t('assets.status.under_maintenance') },
    retired:           { bg: '#F1F5F9', color: C.textMid,  label: t('assets.status.retired') },
  }

  const woStatusConfig: Record<string, { bg: string; color: string }> = {
    new:         { bg: '#e3f2fd', color: C.blue },
    assigned:    { bg: '#e8eaf6', color: C.navy },
    in_progress: { bg: '#fff8e1', color: C.warning },
    on_hold:     { bg: '#fce4ec', color: C.danger },
    completed:   { bg: '#e8f5e9', color: C.success },
    closed:      { bg: '#f5f5f5', color: C.textMid },
  }

  const sCfg = statusConfig[asset.status] ?? statusConfig.active

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px', border: 'none',
    borderBottom: active ? `2px solid ${C.navy}` : '2px solid transparent',
    background: 'transparent', cursor: 'pointer',
    fontSize: 13, fontWeight: (active ? 600 : 400) as any,
    color: active ? C.navy : C.textLight,
    fontFamily: F.en,
  })

  const infoCard = { background: C.pageBg, borderRadius: 8, padding: '12px 16px' }
  const openWOs = workOrders.filter(w => !['completed','closed'].includes(w.status)).length
  const photos = asset.photo_urls ?? []

  return (
    <div style={{ ...pageStyle, maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <a href='/dashboard/assets' style={{ color: C.textLight, fontSize: 13, textDecoration: 'none', fontFamily: F.en }}>{t('common.back')}</a>
        <a href={'/dashboard/assets/' + id + '/edit'}>
          <button style={secondaryBtn}>{t('common.edit')}</button>
        </a>
      </div>

      <div style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{translatedAsset.name ?? asset.name}</h1>
            {lang === 'ar' && (
              <TranslateButton
                texts={{ name: asset.name, description: asset.description ?? '' }}
                onTranslated={setTranslatedAsset}
              />
            )}
          </div>
          <span style={{ background: sCfg.bg, color: sCfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>{sCfg.label}</span>
          {asset.category && <span style={{ background: C.pageBg, color: C.textMid, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontFamily: F.en }}>{asset.category}</span>}
        </div>
        <p style={{ color: C.textLight, fontSize: 13, fontFamily: F.en, marginTop: 6 }}>
          Added {format(new Date(asset.created_at), 'dd MMM yyyy')} · {workOrders.length} work orders · {openWOs} open
          {asset.purchase_cost && <span> · Purchase cost: SAR {Number(asset.purchase_cost).toLocaleString()}</span>}
        </p>
      </div>

      {warrantyExpired && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: '1rem', background: '#fce4ec', border: `1px solid ${C.dangerBorder}`, fontSize: 13, color: C.danger, fontFamily: F.en }}>
          Warranty expired {Math.abs(warrantyDaysLeft!)} days ago ({format(new Date(asset.warranty_expiry), 'dd MMM yyyy')})
        </div>
      )}
      {warrantySoon && !warrantyExpired && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: '1rem', background: '#fff8e1', border: '1px solid #ffe082', fontSize: 13, color: C.warning, fontFamily: F.en }}>
          Warranty expires in {warrantyDaysLeft} days ({format(new Date(asset.warranty_expiry), 'dd MMM yyyy')})
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {asset.status !== 'active' && <button onClick={() => updateStatus('active')} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #a5d6a7', background: '#e8f5e9', color: C.success, cursor: 'pointer', fontSize: 13, fontFamily: F.en }}>Mark Active</button>}
        {asset.status !== 'under_maintenance' && <button onClick={() => updateStatus('under_maintenance')} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #ffe082', background: '#fff8e1', color: C.warning, cursor: 'pointer', fontSize: 13, fontFamily: F.en }}>Mark Under Maintenance</button>}
        {asset.status !== 'retired' && <button onClick={() => updateStatus('retired')} style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.pageBg, color: C.textMid, cursor: 'pointer', fontSize: 13, fontFamily: F.en }}>Retire Asset</button>}
        <Link href={'/dashboard/work-orders/new?asset_id=' + asset.id}>
          <button style={primaryBtn}>+ New Work Order</button>
        </Link>
        {asset.status !== 'retired' && (
          <button
            onClick={async () => {
              if (!confirm('Decommission this asset? This will retire it and suspend all active PM schedules.')) return
              await supabase.from('assets').update({ status: 'retired', updated_at: new Date().toISOString() }).eq('id', id)
              await supabase.from('pm_schedules').update({ is_active: false }).eq('asset_id', id)
              await supabase.from('work_orders').insert({
                title: 'Decommission: ' + asset.name,
                description: 'Final decommission work order. Asset has been retired.',
                priority: 'medium',
                status: 'new',
                source: 'manual',
                asset_id: id,
                organisation_id: asset.organisation_id,
                created_by: (await supabase.auth.getUser()).data.user?.id,
              })
              fetchAll()
            }}
            style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.dangerBorder}`, background: '#fce4ec', color: C.danger, cursor: 'pointer', fontSize: 13, fontFamily: F.en }}
          >
            Decommission Asset
          </button>
        )}
      </div>

      <div style={{ borderBottom: `1px solid ${C.border}`, marginBottom: '1rem', display: 'flex', flexWrap: 'wrap' }}>
        <button style={tabStyle(activeTab === 'details')} onClick={() => setActiveTab('details')}>Details</button>
        <button style={tabStyle(activeTab === 'workorders')} onClick={() => setActiveTab('workorders')}>Work Orders ({workOrders.length})</button>
        <button style={tabStyle(activeTab === 'pm')} onClick={() => setActiveTab('pm')}>PM Schedules ({pmSchedules.length})</button>
        <button style={tabStyle(activeTab === 'photos')} onClick={() => setActiveTab('photos')}>Photos ({photos.length})</button>
        <button style={tabStyle(activeTab === 'qr')} onClick={() => setActiveTab('qr')}>QR Code</button>
        <button style={tabStyle(activeTab === 'pmhistory')} onClick={() => setActiveTab('pmhistory')}>PM History ({pmHistory.length})</button>
        <button style={tabStyle(activeTab === 'custom')} onClick={() => setActiveTab('custom')}>Custom Fields</button>
      </div>

      {activeTab === 'details' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {[
              { label: 'Site',                         value: asset.site?.name ?? '—' },
              { label: 'Sub-location',                 value: asset.sub_location ?? '—' },
              { label: 'Location Notes',               value: asset.location_notes ?? '—' },
              { label: 'Category',                     value: asset.category ?? '—' },
              { label: 'Manufacturer',                 value: asset.manufacturer ?? '—' },
              { label: 'Model',                        value: asset.model ?? '—' },
              { label: 'Serial Number',                value: asset.serial_number ?? '—' },
              { label: 'Purchase Date',                value: asset.purchase_date ? format(new Date(asset.purchase_date), 'dd MMM yyyy') : '—' },
              { label: 'Purchase Cost',                value: asset.purchase_cost ? 'SAR ' + Number(asset.purchase_cost).toLocaleString() : '—' },
              { label: 'Warranty Expiry',              value: asset.warranty_expiry ? format(new Date(asset.warranty_expiry), 'dd MMM yyyy') : '—' },
              { label: 'Expected Lifespan',            value: asset.expected_lifespan_years ? asset.expected_lifespan_years + ' years' : '—' },
              { label: 'Lifecycle Cost (closed WOs)',  value: lifecycleCost > 0 ? 'SAR ' + lifecycleCost.toLocaleString() : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={infoCard}>
                <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 500, color: C.textDark, fontFamily: F.en, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>
          {asset.description && (
            <div style={{ ...infoCard, marginTop: 4 }}>
              <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 6px' }}>Description</p>
              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6, color: C.textDark, fontFamily: F.en }}>{asset.description}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'workorders' && (
        <div>
          {workOrders.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No work orders raised for this asset yet.</p>
          ) : (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                    {['Title','Priority','Status','Assigned To','Created'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: F.en }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workOrders.map((wo) => {
                    const woCfg = woStatusConfig[wo.status] ?? woStatusConfig.new
                    return (
                      <tr key={wo.id} style={{ background: C.white }}>
                        <td style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                          <Link href={'/dashboard/work-orders/' + wo.id} style={{ color: C.navy, fontWeight: 500, textDecoration: 'none', fontSize: 13, fontFamily: F.en }}>{wo.title}</Link>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500, fontFamily: F.en, borderBottom: `1px solid ${C.border}`, color: wo.priority === 'critical' ? C.danger : wo.priority === 'high' ? C.warning : wo.priority === 'medium' ? C.warning : C.success }}>
                          {wo.priority.charAt(0).toUpperCase() + wo.priority.slice(1)}
                        </td>
                        <td style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ background: woCfg.bg, color: woCfg.color, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>
                            {wo.status.replace('_',' ').replace(/\w/g, (l: string) => l.toUpperCase())}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: C.textMid, fontFamily: F.en, borderBottom: `1px solid ${C.border}` }}>{wo.assignee?.full_name ?? 'Unassigned'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: C.textMid, fontFamily: F.en, borderBottom: `1px solid ${C.border}` }}>{format(new Date(wo.created_at), 'dd MMM yyyy')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'pm' && (
        <div>
          {pmSchedules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: C.textLight, fontFamily: F.en }}>
              <p style={{ fontSize: 14, marginBottom: 12 }}>No PM schedules linked to this asset yet.</p>
              <Link href='/dashboard/pm-schedules/new'>
                <button style={primaryBtn}>+ Create PM Schedule</button>
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pmSchedules.map(pm => (
                <div key={pm.id} style={{ background: C.pageBg, borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: C.textDark, fontFamily: F.en, margin: 0 }}>{pm.title}</p>
                    <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>
                      {pm.frequency.charAt(0).toUpperCase() + pm.frequency.slice(1)} · {pm.assignee?.full_name ?? 'Unassigned'}
                      {pm.next_due_at && ' · Next due: ' + format(new Date(pm.next_due_at), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <span style={{ background: pm.is_active ? '#DCFCE7' : C.pageBg, color: pm.is_active ? C.success : C.textMid, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>
                    {pm.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'photos' && (
        <div>
          {photos.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No photos attached to this asset.</p>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {photos.map((url: string, i: number) => (
                <img key={i} src={url} alt={'Photo ' + (i+1)} style={{ width: 150, height: 150, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'qr' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontSize: 13, color: C.textMid, fontFamily: F.en, marginBottom: '1.5rem' }}>Scan this QR code to open this asset on any device. Print and attach it physically to the asset.</p>
          <div style={{ display: 'inline-block', padding: '1.5rem', border: `1px solid ${C.border}`, borderRadius: 12, background: C.white, marginBottom: '1rem' }}>
            <img src={'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.origin + '/dashboard/assets/' + asset.id : '')} alt={t('assets.qr')} width={200} height={200} />
          </div>
          <p style={{ fontSize: 12, color: C.textLight, fontFamily: 'monospace' }}>{asset.qr_code}</p>
          <p style={{ fontSize: 13, color: C.textMid, fontFamily: F.en, marginTop: 8 }}>{asset.name} · {asset.site?.name ?? 'No site'}</p>
          <button onClick={() => window.print()} style={{ ...primaryBtn, marginTop: '1rem' }}>Print QR Code</button>
        </div>
      )}

      {activeTab === 'pmhistory' && (
        <div>
          <p style={{ fontSize: 13, color: C.textMid, fontFamily: F.en, marginBottom: '1rem' }}>All completed preventive maintenance tasks for this asset.</p>
          {pmHistory.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en }}>No PM history yet. PMs will appear here once completed.</p>
          ) : (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                    {['Task','Schedule','Technician','Status','Due Date','Completed'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: F.en }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pmHistory.map((pm: any) => (
                    <tr key={pm.id} style={{ background: C.white }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500, color: C.textDark, fontFamily: F.en, borderBottom: `1px solid ${C.border}` }}>{pm.title ?? pm.schedule?.title ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: C.textMid, fontFamily: F.en, borderBottom: `1px solid ${C.border}` }}>{pm.schedule?.frequency ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: C.textMid, fontFamily: F.en, borderBottom: `1px solid ${C.border}` }}>{pm.technician?.full_name ?? 'Unassigned'}</td>
                      <td style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ background: pm.status === 'completed' ? '#e8f5e9' : pm.status === 'overdue' ? '#fce4ec' : '#fff8e1', color: pm.status === 'completed' ? C.success : pm.status === 'overdue' ? C.danger : C.warning, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 500, fontFamily: F.en }}>
                          {pm.status?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: C.textMid, fontFamily: F.en, borderBottom: `1px solid ${C.border}` }}>{pm.due_date ? new Date(pm.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: C.textMid, fontFamily: F.en, borderBottom: `1px solid ${C.border}` }}>{pm.completed_at ? new Date(pm.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'custom' && (
        <CustomFieldsTab assetId={id as string} initialFields={asset.custom_fields ?? {}} supabase={supabase} />
      )}
    </div>
  )
}

function CustomFieldsTab({ assetId, initialFields, supabase }: { assetId: string; initialFields: Record<string, string>; supabase: any }) {
  const [fields, setFields] = useState<Record<string, string>>(initialFields)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function addField() {
    if (!newKey.trim()) return
    const updated = { ...fields, [newKey.trim()]: newValue.trim() }
    setSaving(true)
    await supabase.from('assets').update({ custom_fields: updated }).eq('id', assetId)
    setFields(updated)
    setNewKey('')
    setNewValue('')
    setSaving(false)
  }

  async function removeField(key: string) {
    const updated = { ...fields }
    delete updated[key]
    await supabase.from('assets').update({ custom_fields: updated }).eq('id', assetId)
    setFields(updated)
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: C.textMid, fontFamily: F.en, marginBottom: '1rem' }}>Add custom fields to capture asset-specific data like hotel room number, classroom ID, or target temperature.</p>
      {Object.keys(fields).length === 0 ? (
        <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, marginBottom: '1rem' }}>No custom fields yet.</p>
      ) : (
        <div style={{ marginBottom: '1rem' }}>
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, background: C.pageBg, borderRadius: 8, padding: '8px 12px' }}>
              <span style={{ fontSize: 13, fontWeight: 500, minWidth: 150, color: C.textDark, fontFamily: F.en }}>{key}</span>
              <span style={{ fontSize: 13, color: C.textMid, fontFamily: F.en, flex: 1 }}>{value}</span>
              <button onClick={() => removeField(key)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 13, fontFamily: F.en }}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder='Field name (e.g. Room Number)' style={{ ...inputStyle, flex: 1 }} />
        <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder='Value (e.g. 204)' style={{ ...inputStyle, flex: 1 }} />
        <button onClick={addField} disabled={saving || !newKey.trim()} style={{ padding: '8px 18px', background: C.navy, color: C.white, border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: F.en }}>
          {saving ? '...' : 'Add Field'}
        </button>
      </div>
    </div>
  )
}
