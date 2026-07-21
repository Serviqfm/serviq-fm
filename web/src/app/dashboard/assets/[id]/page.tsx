'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { format, differenceInDays } from 'date-fns'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'
import TranslateButton from '@/components/TranslateButton'
import EntityFilesTab from '@/components/EntityFilesTab'
import { useLanguage } from '@/context/LanguageContext'
import { mtbfDays, downtimeStats } from '@/lib/kpis'

// FIX #1: Move createClient() outside component (singleton) to prevent infinite re-render loop
const supabase = createClient()

// FIX #3 & #4: Define proper Asset interface without [key: string]: any
// and without unused icon property
interface Asset {
  id: string
  name: string
  category?: string
  status: 'active' | 'under_maintenance' | 'retired'
  location?: string
  site?: { name: string }
  description?: string
  manufacturer?: string
  model?: string
  serial_number?: string
  purchase_date?: string
  purchase_cost?: number
  warranty_expiry?: string
  expected_lifespan_years?: number
  sub_location?: string
  location_notes?: string
  created_at: string
  updated_at?: string
  organisation_id: string
  photo_urls?: string[]
  qr_code?: string
  custom_fields?: Record<string, string>
  parent_asset_id?: string | null
  parent?: { id: string; name: string } | null
}

interface AncestorAsset {
  id: string
  name: string
  parent_asset_id?: string | null
}

interface ChildAsset {
  id: string
  name: string
  status: string
}

// B8 / AL-03 — one downtime period on this asset (asset_downtime table).
interface DowntimePeriod {
  id: string
  started_at: string
  ended_at: string | null
  cause: string | null
  work_order_id: string | null
}

export default function AssetDetailPage() {
  const { id } = useParams()
  // FIX #2: Validate params.id - it could be string array in catch-all routes
  const assetId = Array.isArray(id) ? id[0] : (id as string)
  const { t, lang } = useLanguage()
  // FIX #3: Use Asset interface instead of any
  const [asset, setAsset] = useState<Asset | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [workOrders, setWorkOrders] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pmSchedules, setPmSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [translatedAsset, setTranslatedAsset] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<'details' | 'workorders' | 'pm' | 'photos' | 'qr' | 'custom' | 'pmhistory' | 'children' | 'downtime' | 'files'>('details')
  // AL-11: QR rendered locally (qrcode lib), no third-party fetch.
  const [qrDataUrl, setQrDataUrl] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pmHistory, setPmHistory] = useState<any[]>([])
  const [childAssets, setChildAssets] = useState<ChildAsset[]>([])
  const [ancestors, setAncestors] = useState<AncestorAsset[]>([])
  const [downtime, setDowntime] = useState<DowntimePeriod[]>([])
  const [downtimeDays, setDowntimeDays] = useState(30) // availability window (AL-03 default 30)

  // FIX #1 continued: Wrap fetchAll in useCallback to avoid re-renders
  const fetchAll = useCallback(async () => {
    const [{ data: assetData }, { data: woData }, { data: pmData }, { data: childData }, { data: pmHistoryData }, { data: downtimeData }] = await Promise.all([
      supabase.from('assets').select('*, site:site_id(name), parent:parent_asset_id(id, name)').eq('id', assetId).single(),
      supabase.from('work_orders').select('*, assignee:assigned_to(full_name)').eq('asset_id', assetId).order('created_at', { ascending: false }),
      supabase.from('pm_schedules').select('*, assignee:assigned_to(full_name)').eq('asset_id', assetId).order('created_at', { ascending: false }),
      supabase.from('assets').select('id, name, status').eq('parent_asset_id', assetId).order('name'),
      // DV-28: completed PM-generated work orders for this asset (real pm_schedule_id link).
      supabase.from('work_orders')
        .select('id, title, status, due_at, completed_at, schedule:pm_schedule_id(title, frequency), technician:assigned_to(full_name)')
        .eq('asset_id', assetId)
        .not('pm_schedule_id', 'is', null)
        .in('status', ['completed', 'closed'])
        .order('due_at', { ascending: false }),
      // B8/AL-03: downtime periods. Table may not exist pre-migration — data
      // stays null and the tab just shows an empty log.
      supabase.from('asset_downtime')
        .select('id, started_at, ended_at, cause, work_order_id')
        .eq('asset_id', assetId)
        .order('started_at', { ascending: false }),
    ])
    if (assetData) setAsset(assetData as Asset)
    if (woData) setWorkOrders(woData)
    if (pmData) setPmSchedules(pmData)
    if (childData) setChildAssets(childData as ChildAsset[])
    if (pmHistoryData) setPmHistory(pmHistoryData)
    if (downtimeData) setDowntime(downtimeData as DowntimePeriod[])

    // Walk up the parent chain to build the ancestor breadcrumb (max 4 levels).
    const chain: AncestorAsset[] = []
    let parentId: string | null = assetData?.parent_asset_id ?? null
    let guard = 0
    while (parentId && guard < 4) {
      const { data: node } = await supabase.from('assets').select('id, name, parent_asset_id').eq('id', parentId).single()
      if (!node) break
      chain.unshift(node as AncestorAsset)
      parentId = (node as AncestorAsset).parent_asset_id ?? null
      guard++
    }
    setAncestors(chain)
    setLoading(false)
  }, [assetId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // AL-11: generate the QR data URL client-side (no api.qrserver.com leak).
  useEffect(() => {
    if (!asset) return
    QRCode.toDataURL(window.location.origin + '/dashboard/assets/' + asset.id, { width: 200, margin: 2 })
      .then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [asset])

  async function updateStatus(newStatus: string) {
    await supabase.from('assets').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', assetId)
    fetchAll()
  }

  // B8/AL-03 — Mark Down: open a downtime period + sync status. We sync to
  // 'under_maintenance' (not 'offline'): it is the only "down" value the asset
  // badges/list/mobile all understand — 'offline' exists solely in the WO
  // space-assets commissioning panel. Manual-first: no auto-open from WOs yet.
  async function markDown() {
    if (!asset) return
    const cause = window.prompt(lang === 'ar' ? 'سبب التوقف (اختياري):' : 'Cause of downtime (optional):')
    if (cause === null) return // cancelled
    const uid = (await supabase.auth.getUser()).data.user?.id
    const { error } = await supabase.from('asset_downtime').insert({
      organisation_id: asset.organisation_id,
      asset_id: assetId,
      cause: cause.trim() || null,
      created_by: uid ?? null,
    })
    if (error) {
      alert((lang === 'ar' ? 'تعذر تسجيل التوقف: ' : 'Could not log downtime: ') + error.message)
      return
    }
    await supabase.from('assets').update({ status: 'under_maintenance', updated_at: new Date().toISOString() }).eq('id', assetId)
    fetchAll()
  }

  // B8/AL-03 — Mark Restored: close every open period + sync status back.
  async function markRestored() {
    const { error } = await supabase.from('asset_downtime')
      .update({ ended_at: new Date().toISOString() })
      .eq('asset_id', assetId)
      .is('ended_at', null)
    if (error) {
      alert((lang === 'ar' ? 'تعذر إنهاء التوقف: ' : 'Could not close downtime: ') + error.message)
      return
    }
    await supabase.from('assets').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', assetId)
    fetchAll()
  }

  if (loading) return <div className="p-8 text-on-surface-variant">Loading...</div>
  if (!asset) return <div className="p-8 text-on-surface-variant">Asset not found.</div>

  const warrantyDaysLeft = asset.warranty_expiry ? differenceInDays(new Date(asset.warranty_expiry), new Date()) : null
  const warrantyExpired = warrantyDaysLeft !== null && warrantyDaysLeft < 0
  const warrantySoon = warrantyDaysLeft !== null && warrantyDaysLeft >= 0 && warrantyDaysLeft <= 30

  const lifecycleCost = workOrders
    .filter(w => w.status === 'closed')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .reduce((sum: number, w: any) => sum + (w.actual_cost || 0), 0)

  const statusConfig: Record<string, { className: string; label: string }> = {
    active:            { className: 'bg-primary/10 text-primary',                              label: t('assets.status.active') },
    under_maintenance: { className: 'bg-[#f57f17]/10 text-[#f57f17]',                         label: t('assets.status.under_maintenance') },
    retired:           { className: 'bg-surface-container-low text-on-surface-variant',        label: t('assets.status.retired') },
  }

  const woStatusConfig: Record<string, { className: string }> = {
    new:         { className: 'bg-blue-50 text-blue-700' },
    assigned:    { className: 'bg-indigo-50 text-indigo-700' },
    in_progress: { className: 'bg-[#f57f17]/10 text-[#f57f17]' },
    on_hold:     { className: 'bg-error/10 text-error' },
    completed:   { className: 'bg-primary/10 text-primary' },
    closed:      { className: 'bg-surface-container-low text-on-surface-variant' },
  }

  const sCfg = statusConfig[asset.status] ?? statusConfig.active

  const tabCls = (active: boolean) =>
    `px-4 py-2 border-0 bg-transparent cursor-pointer text-sm font-${active ? 'semibold' : 'normal'} ${active ? 'text-primary border-b-2 border-primary' : 'text-on-surface-variant border-b-2 border-transparent'}`

  const openWOs = workOrders.filter(w => !['completed','closed'].includes(w.status)).length
  const photos = asset.photo_urls ?? []

  // B8/AL-03 — reliability, computed from downtime rows (lib/kpis math).
  const openDowntime = downtime.find(d => !d.ended_at)
  const { downtimeMs, availabilityPct } = downtimeStats(downtime, downtimeDays)
  // MTBF = mean days between downtime starts; reuse the per-asset gap math.
  const mtbf = mtbfDays(downtime.map(d => ({ asset_id: assetId, completed_at: d.started_at })))
  const fmtDur = (ms: number) => ms >= 48 * 3_600_000
    ? (ms / 86_400_000).toFixed(1) + (lang === 'ar' ? ' يوم' : 'd')
    : (ms / 3_600_000).toFixed(1) + (lang === 'ar' ? ' ساعة' : 'h')

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[860px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <a href='/dashboard/assets' className="text-on-surface-variant text-sm hover:text-primary transition-colors">
            {/* FIX #6: Add aria-label to back link */}
            {t('common.back')}
          </a>
          {/* FIX #6: Add aria-label to edit button */}
          <a href={'/dashboard/assets/' + assetId + '/edit'}>
            <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors" aria-label="Edit asset">{t('common.edit')}</button>
          </a>
        </div>

        <div>
          {ancestors.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap text-sm mb-1.5">
              {ancestors.map(a => (
                <span key={a.id} className="flex items-center gap-1.5">
                  <Link href={'/dashboard/assets/' + a.id} className="text-primary hover:underline">{a.name}</Link>
                  <span className="text-outline-variant">›</span>
                </span>
              ))}
              <span className="text-on-surface-variant">{asset.name}</span>
            </div>
          )}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[22px] font-bold text-on-surface m-0">{translatedAsset.name ?? asset.name}</h1>
              {lang === 'ar' && (
                <TranslateButton
                  texts={{ name: asset.name, description: asset.description ?? '' }}
                  onTranslated={setTranslatedAsset}
                />
              )}
            </div>
            {/* FIX #5: Decorative status badge */}
            <span className={`${sCfg.className} px-2.5 py-0.5 rounded-full text-xs font-medium`}>{sCfg.label}</span>
            {asset.category && <span className="bg-surface-container-low text-on-surface-variant px-2.5 py-0.5 rounded-full text-xs">{asset.category}</span>}
          </div>
          <p className="text-on-surface-variant text-sm mt-1.5">
            Added {format(new Date(asset.created_at), 'dd MMM yyyy')} · {workOrders.length} work orders · {openWOs} open
            {asset.purchase_cost && <span> · Purchase cost: SAR {Number(asset.purchase_cost).toLocaleString()}</span>}
          </p>
        </div>

        {/* B8/AL-03 — red not-operational flag while a downtime period is open */}
        {openDowntime && (
          <div className="px-3.5 py-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error">
            {lang === 'ar' ? 'الأصل متوقف منذ ' : 'Asset is down since '}
            {format(new Date(openDowntime.started_at), 'dd MMM yyyy HH:mm')}
            {openDowntime.cause ? ' · ' + openDowntime.cause : ''}
          </div>
        )}
        {warrantyExpired && (
          <div className="px-3.5 py-2.5 rounded-lg bg-error/10 border border-error/20 text-sm text-error">
            Warranty expired {Math.abs(warrantyDaysLeft!)} days ago ({format(new Date(asset.warranty_expiry!), 'dd MMM yyyy')})
          </div>
        )}
        {warrantySoon && !warrantyExpired && (
          <div className="px-3.5 py-2.5 rounded-lg bg-[#f57f17]/10 border border-[#f57f17]/20 text-sm text-[#f57f17]">
            Warranty expires in {warrantyDaysLeft} days ({format(new Date(asset.warranty_expiry!), 'dd MMM yyyy')})
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {asset.status !== 'active' && <button onClick={() => updateStatus('active')} className="px-4 py-1.5 rounded-lg border border-green-300 bg-primary/10 text-primary cursor-pointer text-sm">Mark Active</button>}
          {asset.status !== 'under_maintenance' && <button onClick={() => updateStatus('under_maintenance')} className="px-4 py-1.5 rounded-lg border border-[#f57f17]/20 bg-[#f57f17]/10 text-[#f57f17] cursor-pointer text-sm">Mark Under Maintenance</button>}
          {asset.status !== 'retired' && <button onClick={() => updateStatus('retired')} className="px-4 py-1.5 rounded-lg border border-outline-variant bg-surface-container-low text-on-surface-variant cursor-pointer text-sm">Retire Asset</button>}
          {/* B8/AL-03 — downtime logging */}
          {!openDowntime && asset.status !== 'retired' && (
            <button onClick={markDown} className="px-4 py-1.5 rounded-lg border border-error/20 bg-error/10 text-error cursor-pointer text-sm">
              {lang === 'ar' ? 'تسجيل توقف' : 'Mark Down'}
            </button>
          )}
          {openDowntime && (
            <button onClick={markRestored} className="px-4 py-1.5 rounded-lg border border-green-300 bg-primary/10 text-primary cursor-pointer text-sm">
              {lang === 'ar' ? 'تسجيل عودة التشغيل' : 'Mark Restored'}
            </button>
          )}
          <Link href={'/dashboard/work-orders/new?asset_id=' + asset.id}>
            <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">+ New Work Order</button>
          </Link>
          {asset.status !== 'retired' && (
            <button
              onClick={async () => {
                if (!confirm('Decommission this asset? This will retire it and suspend all active PM schedules.')) return
                await supabase.from('assets').update({ status: 'retired', updated_at: new Date().toISOString() }).eq('id', assetId)
                await supabase.from('pm_schedules').update({ is_active: false }).eq('asset_id', assetId)
                await supabase.from('work_orders').insert({
                  title: 'Decommission: ' + asset.name,
                  description: 'Final decommission work order. Asset has been retired.',
                  priority: 'medium',
                  status: 'new',
                  source: 'manual',
                  asset_id: assetId,
                  organisation_id: asset.organisation_id,
                  created_by: (await supabase.auth.getUser()).data.user?.id,
                })
                fetchAll()
              }}
              className="px-4 py-1.5 rounded-lg border border-error/20 bg-error/10 text-error cursor-pointer text-sm"
            >
              Decommission Asset
            </button>
          )}
        </div>

        <div className="border-b border-outline-variant flex flex-wrap">
          <button className={tabCls(activeTab === 'details')} onClick={() => setActiveTab('details')}>Details</button>
          <button className={tabCls(activeTab === 'children')} onClick={() => setActiveTab('children')}>{lang === 'ar' ? 'الأصول الفرعية' : 'Child Assets'} ({childAssets.length})</button>
          <button className={tabCls(activeTab === 'workorders')} onClick={() => setActiveTab('workorders')}>Work Orders ({workOrders.length})</button>
          <button className={tabCls(activeTab === 'pm')} onClick={() => setActiveTab('pm')}>PM Schedules ({pmSchedules.length})</button>
          <button className={tabCls(activeTab === 'photos')} onClick={() => setActiveTab('photos')}>Photos ({photos.length})</button>
          <button className={tabCls(activeTab === 'files')} onClick={() => setActiveTab('files')}>{lang === 'ar' ? 'الملفات' : 'Files'}</button>
          <button className={tabCls(activeTab === 'qr')} onClick={() => setActiveTab('qr')}>QR Code</button>
          <button className={tabCls(activeTab === 'pmhistory')} onClick={() => setActiveTab('pmhistory')}>PM History ({pmHistory.length})</button>
          <button className={tabCls(activeTab === 'downtime')} onClick={() => setActiveTab('downtime')}>{lang === 'ar' ? 'التوقفات' : 'Downtime'} ({downtime.length})</button>
          <button className={tabCls(activeTab === 'custom')} onClick={() => setActiveTab('custom')}>Custom Fields</button>
        </div>

        {activeTab === 'details' && (
          <div>
            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              {[
                {
                  label: lang === 'ar' ? 'الأصل الرئيسي' : 'Parent Asset',
                  value: asset.parent
                    ? <Link href={'/dashboard/assets/' + asset.parent.id} className="text-primary hover:underline">{asset.parent.name}</Link>
                    : '—',
                },
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
                <div key={label} className="bg-surface-container-low rounded-lg px-4 py-3">
                  <p className="text-xs text-on-surface-variant mb-1">{label}</p>
                  <p className="text-sm font-medium text-on-surface m-0">{value}</p>
                </div>
              ))}
            </div>
            {asset.description && (
              <div className="bg-surface-container-low rounded-lg px-4 py-3 mt-1">
                <p className="text-xs text-on-surface-variant mb-1.5">Description</p>
                <p className="text-sm m-0 leading-relaxed text-on-surface">{asset.description}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'children' && (
          <div>
            {childAssets.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{lang === 'ar' ? 'لا توجد أصول فرعية تحت هذا الأصل بعد.' : 'No child assets under this asset yet.'}</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {childAssets.map(child => {
                  const cCfg = statusConfig[child.status] ?? statusConfig.active
                  return (
                    <div key={child.id} className="bg-surface-container-low rounded-lg px-4 py-3 flex justify-between items-center">
                      <Link href={'/dashboard/assets/' + child.id} className="text-sm font-medium text-primary hover:underline">{child.name}</Link>
                      <span className={`${cCfg.className} px-2.5 py-0.5 rounded-full text-xs font-medium`}>{cCfg.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'workorders' && (
          <div>
            {workOrders.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No work orders raised for this asset yet.</p>
            ) : (
              <div className="border border-outline-variant rounded-xl overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant">
                      {['Title','Priority','Status','Assigned To','Created'].map(h => (
                        <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {workOrders.map((wo) => {
                      const woCfg = woStatusConfig[wo.status] ?? woStatusConfig.new
                      return (
                        <tr key={wo.id} className="bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
                          <td className="px-4 py-2.5 border-b border-outline-variant">
                            <Link href={'/dashboard/work-orders/' + wo.id} className="text-primary font-medium no-underline text-sm">{wo.title}</Link>
                          </td>
                          <td className={`px-4 py-2.5 text-xs font-medium border-b border-outline-variant ${wo.priority === 'critical' ? 'text-error' : wo.priority === 'high' ? 'text-[#f57f17]' : wo.priority === 'medium' ? 'text-[#f57f17]' : 'text-primary'}`}>
                            {wo.priority.charAt(0).toUpperCase() + wo.priority.slice(1)}
                          </td>
                          <td className="px-4 py-2.5 border-b border-outline-variant">
                            <span className={`${woCfg.className} px-2 py-0.5 rounded-full text-xs font-medium`}>
                              {wo.status.replace('_',' ').replace(/\w/g, (l: string) => l.toUpperCase())}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-on-surface-variant border-b border-outline-variant">{wo.assignee?.full_name ?? 'Unassigned'}</td>
                          <td className="px-4 py-2.5 text-sm text-on-surface-variant border-b border-outline-variant">{format(new Date(wo.created_at), 'dd MMM yyyy')}</td>
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
              <div className="text-center py-8 text-on-surface-variant">
                <p className="text-sm mb-3">No PM schedules linked to this asset yet.</p>
                <Link href='/dashboard/pm-schedules/new'>
                  <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">+ Create PM Schedule</button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {pmSchedules.map(pm => (
                  <div key={pm.id} className="bg-surface-container-low rounded-lg px-4 py-3 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-on-surface m-0">{pm.title}</p>
                      <p className="text-xs text-on-surface-variant mt-1 mb-0">
                        {pm.frequency.charAt(0).toUpperCase() + pm.frequency.slice(1)} · {pm.assignee?.full_name ?? 'Unassigned'}
                        {pm.next_due_at && ' · Next due: ' + format(new Date(pm.next_due_at), 'dd MMM yyyy')}
                      </p>
                    </div>
                    <span className={`${pm.is_active ? 'bg-primary/10 text-primary' : 'bg-surface-container-low text-on-surface-variant'} px-2.5 py-0.5 rounded-full text-xs font-medium`}>
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
              <p className="text-sm text-on-surface-variant">No photos attached to this asset.</p>
            ) : (
              <div className="flex gap-3 flex-wrap">
                {photos.map((url: string, i: number) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt={'Photo ' + (i+1)} className="w-[150px] h-[150px] object-cover rounded-lg border border-outline-variant" />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <EntityFilesTab entityType="asset" entityId={assetId} orgId={asset.organisation_id} />
        )}

        {activeTab === 'qr' && (
          <div className="text-center py-8">
            <p className="text-sm text-on-surface-variant mb-6">Scan this QR code to open this asset on any device. Print and attach it physically to the asset.</p>
            <div className="inline-block p-6 border border-outline-variant rounded-xl bg-surface-container-lowest mb-4">
              {qrDataUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={qrDataUrl} alt={t('assets.qr')} width={200} height={200} />
                : <div className="w-[200px] h-[200px]" />}
            </div>
            <p className="text-xs text-outline font-mono">{asset.qr_code}</p>
            <p className="text-sm text-on-surface-variant mt-2">{asset.name} · {asset.site?.name ?? 'No site'}</p>
            <button onClick={() => window.print()} className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 mt-4">Print QR Code</button>
          </div>
        )}

        {activeTab === 'pmhistory' && (
          <div>
            <p className="text-sm text-on-surface-variant mb-4">All completed preventive maintenance tasks for this asset.</p>
            {pmHistory.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No PM history yet. PMs will appear here once completed.</p>
            ) : (
              <div className="border border-outline-variant rounded-xl overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-outline-variant">
                      {['Task','Schedule','Technician','Status','Due Date','Completed'].map(h => (
                        <th key={h} className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {pmHistory.map((pm: any) => (
                      <tr key={pm.id} className="bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
                        <td className="px-3.5 py-2.5 text-sm font-medium text-on-surface border-b border-outline-variant">{pm.title ?? pm.schedule?.title ?? '—'}</td>
                        <td className="px-3.5 py-2.5 text-sm text-on-surface-variant border-b border-outline-variant">{pm.schedule?.frequency ?? '—'}</td>
                        <td className="px-3.5 py-2.5 text-sm text-on-surface-variant border-b border-outline-variant">{pm.technician?.full_name ?? 'Unassigned'}</td>
                        <td className="px-3.5 py-2.5 border-b border-outline-variant">
                          <span className={`${['completed', 'closed'].includes(pm.status) ? 'bg-primary/10 text-primary' : pm.status === 'overdue' ? 'bg-error/10 text-error' : 'bg-[#f57f17]/10 text-[#f57f17]'} px-2 py-0.5 rounded-lg text-[11px] font-medium`}>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {pm.status?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) ?? '—'}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 text-sm text-on-surface-variant border-b border-outline-variant">{pm.due_at ? new Date(pm.due_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td className="px-3.5 py-2.5 text-sm text-on-surface-variant border-b border-outline-variant">{pm.completed_at ? new Date(pm.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* B8/AL-03 — downtime log + reliability stats */}
        {activeTab === 'downtime' && (
          <div>
            <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
              <p className="text-sm text-on-surface-variant m-0">
                {lang === 'ar' ? 'فترات توقف الأصل ومؤشرات الموثوقية.' : 'Downtime periods and reliability for this asset.'}
              </p>
              <select
                value={downtimeDays}
                onChange={e => setDowntimeDays(Number(e.target.value))}
                className="bg-surface-container-low border border-outline-variant/40 rounded-lg px-3 py-1.5 text-sm text-on-surface outline-none"
              >
                <option value={30}>{lang === 'ar' ? 'آخر 30 يومًا' : 'Last 30 days'}</option>
                <option value={90}>{lang === 'ar' ? 'آخر 90 يومًا' : 'Last 90 days'}</option>
                <option value={365}>{lang === 'ar' ? 'آخر 365 يومًا' : 'Last 365 days'}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-5">
              {[
                { label: lang === 'ar' ? 'نسبة التوفر' : 'Availability', value: availabilityPct.toFixed(1) + '%', alert: availabilityPct < 95 },
                { label: lang === 'ar' ? 'إجمالي التوقف' : 'Total downtime', value: downtimeMs > 0 ? fmtDur(downtimeMs) : '0h', alert: false },
                { label: lang === 'ar' ? 'متوسط بين الأعطال' : 'MTBF', value: mtbf == null ? '—' : mtbf.toFixed(1) + (lang === 'ar' ? ' يوم' : 'd'), alert: false },
              ].map(({ label, value, alert: isAlert }) => (
                <div key={label} className="bg-surface-container-low rounded-lg px-4 py-3">
                  <p className="text-xs text-on-surface-variant mb-1">{label}</p>
                  <p className={`text-lg font-bold m-0 ${isAlert ? 'text-error' : 'text-on-surface'}`}>{value}</p>
                </div>
              ))}
            </div>

            {downtime.length === 0 ? (
              <p className="text-sm text-on-surface-variant">
                {lang === 'ar' ? 'لا توجد توقفات مسجلة. استخدم زر «تسجيل توقف» أعلاه.' : 'No downtime recorded yet. Use "Mark Down" above when this asset goes out of service.'}
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {downtime.map(d => {
                  const endMs = d.ended_at ? new Date(d.ended_at).getTime() : Date.now()
                  const durMs = Math.max(0, endMs - new Date(d.started_at).getTime())
                  return (
                    <div key={d.id} className="bg-surface-container-low rounded-lg px-4 py-3 flex justify-between items-center gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-medium text-on-surface m-0">
                          {format(new Date(d.started_at), 'dd MMM yyyy HH:mm')}
                          {' → '}
                          {d.ended_at ? format(new Date(d.ended_at), 'dd MMM yyyy HH:mm') : (lang === 'ar' ? 'مستمر' : 'ongoing')}
                        </p>
                        <p className="text-xs text-on-surface-variant mt-1 mb-0">
                          {fmtDur(durMs)}
                          {d.cause && <span> · {d.cause}</span>}
                          {d.work_order_id && (
                            <span> · <Link href={'/dashboard/work-orders/' + d.work_order_id} className="text-primary hover:underline">{lang === 'ar' ? 'أمر العمل' : 'Work order'}</Link></span>
                          )}
                        </p>
                      </div>
                      <span className={`${d.ended_at ? 'bg-surface-container-lowest text-on-surface-variant' : 'bg-error/10 text-error'} px-2.5 py-0.5 rounded-full text-xs font-medium`}>
                        {d.ended_at ? (lang === 'ar' ? 'منتهي' : 'Resolved') : (lang === 'ar' ? 'متوقف الآن' : 'Down now')}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'custom' && (
          <CustomFieldsTab assetId={assetId} initialFields={asset.custom_fields ?? {}} supabase={supabase} />
        )}
      </div>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      <p className="text-sm text-on-surface-variant mb-4">Add custom fields to capture asset-specific data like hotel room number, classroom ID, or target temperature.</p>
      {Object.keys(fields).length === 0 ? (
        <p className="text-sm text-on-surface-variant mb-4">No custom fields yet.</p>
      ) : (
        <div className="mb-4">
          {Object.entries(fields).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2.5 mb-2 bg-surface-container-low rounded-lg px-3 py-2">
              <span className="text-sm font-medium min-w-[150px] text-on-surface">{key}</span>
              <span className="text-sm text-on-surface-variant flex-1">{value}</span>
              <button onClick={() => removeField(key)} className="bg-transparent border-0 text-error cursor-pointer text-sm">Remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 items-center flex-wrap">
        <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder='Field name (e.g. Room Number)' className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all flex-1" />
        <input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder='Value (e.g. 204)' className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all flex-1" />
        <button onClick={addField} disabled={saving || !newKey.trim()} className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50">
          {saving ? '...' : 'Add Field'}
        </button>
      </div>
    </div>
  )
}
