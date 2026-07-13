'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { format } from 'date-fns'
import { useLanguage } from '@/context/LanguageContext'
import EntityFilesTab from '@/components/EntityFilesTab'

type Tab = 'details' | 'work_orders' | 'assets' | 'parts' | 'files'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-primary/10 text-primary',
  in_progress: 'bg-tertiary/10 text-tertiary',
  on_hold: 'bg-surface-container-low text-on-surface-variant',
  completed: 'bg-primary/10 text-primary',
  closed: 'bg-surface-container-low text-on-surface-variant',
}

export default function SiteDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const [tab, setTab] = useState<Tab>('details')
  const [site, setSite] = useState<Row | null>(null)
  const [orgId, setOrgId] = useState('')
  const [team, setTeam] = useState<Row | null>(null)
  const [spaceCount, setSpaceCount] = useState(0)
  const [workOrders, setWorkOrders] = useState<Row[]>([])
  const [assets, setAssets] = useState<Row[]>([])
  const [parts, setParts] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)

    const { data: siteData } = await supabase.from('sites').select('*').eq('id', params.id).eq('organisation_id', profile.organisation_id).single()
    setSite(siteData ?? null)

    const [{ count: spaces }, { data: wos }, { data: ass }, { data: prt }] = await Promise.all([
      supabase.from('spaces').select('id', { count: 'exact', head: true }).eq('site_id', params.id),
      supabase.from('work_orders').select('id, title, status, priority, created_at').eq('site_id', params.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('assets').select('id, name, asset_tag, status, category').eq('site_id', params.id).order('name').limit(200),
      supabase.from('inventory_items').select('id, name, sku, quantity, unit').eq('site_id', params.id).order('name').limit(200),
    ])
    setSpaceCount(spaces ?? 0)
    setWorkOrders(wos ?? [])
    setAssets(ass ?? [])
    setParts(prt ?? [])

    if (siteData?.assigned_team_id) {
      const { data: teamData } = await supabase.from('teams').select('id, name, name_ar').eq('id', siteData.assigned_team_id).single()
      setTeam(teamData ?? null)
    } else {
      setTeam(null)
    }
    setLoading(false)
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>
  if (!site) return (
    <div className="p-8">
      <p className="text-on-surface-variant mb-3">{lang === 'ar' ? 'الموقع غير موجود.' : 'Site not found.'}</p>
      <Link href="/dashboard/sites" className="text-primary hover:underline">{lang === 'ar' ? 'رجوع للمواقع' : 'Back to Sites'}</Link>
    </div>
  )

  const tabs: { key: Tab; label_en: string; label_ar: string; count?: number }[] = [
    { key: 'details', label_en: 'Details', label_ar: 'التفاصيل' },
    { key: 'work_orders', label_en: 'Work Orders', label_ar: 'أوامر العمل', count: workOrders.length },
    { key: 'assets', label_en: 'Assets', label_ar: 'الأصول', count: assets.length },
    { key: 'parts', label_en: 'Parts', label_ar: 'قطع الغيار', count: parts.length },
    { key: 'files', label_en: 'Files', label_ar: 'الملفات' },
  ]

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <p className="text-xs text-on-surface-variant mb-1">
              <Link href="/dashboard/sites" className="text-primary hover:underline">{t('nav.sites')}</Link>
              {' / '}{site.name}
            </p>
            <h1 className="text-3xl font-bold text-on-surface">{site.name}</h1>
            {site.name_ar && <p className="text-sm text-on-surface-variant mt-1 text-right" dir="rtl">{site.name_ar}</p>}
          </div>
          <div className="flex gap-2.5">
            <Link href={`/dashboard/sites/${params.id}/spaces`}>
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">{lang === 'ar' ? 'المساحات' : 'Spaces'} ({spaceCount})</button>
            </Link>
            <Link href={`/dashboard/sites/${params.id}/edit`}>
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">{t('common.edit')}</button>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-outline-variant overflow-x-auto">
          {tabs.map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === tb.key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
              {lang === 'ar' ? tb.label_ar : tb.label_en}{typeof tb.count === 'number' ? ` (${tb.count})` : ''}
            </button>
          ))}
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
          {tab === 'details' && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <Field label={lang === 'ar' ? 'المدينة' : 'City'} value={site.city} />
              <Field label={lang === 'ar' ? 'العنوان' : 'Address'} value={site.address} />
              <Field label={lang === 'ar' ? 'الفريق المسؤول' : 'Assigned team'} value={team ? (lang === 'ar' && team.name_ar ? team.name_ar : team.name) : null} />
              <Field label={lang === 'ar' ? 'المساحات' : 'Spaces'} value={String(spaceCount)} />
              <Field label={lang === 'ar' ? 'الإحداثيات' : 'GPS coordinates'}
                value={site.latitude != null && site.longitude != null ? `${site.latitude}, ${site.longitude}` : null}
                href={site.latitude != null && site.longitude != null ? `https://www.google.com/maps?q=${site.latitude},${site.longitude}` : undefined} />
              <Field label={lang === 'ar' ? 'الحالة' : 'Status'} value={site.is_active ? t('common.active') : t('common.inactive')} />
              <Field label={lang === 'ar' ? 'أُضيف' : 'Added'} value={site.created_at ? format(new Date(site.created_at), 'dd MMM yyyy') : null} />
            </dl>
          )}

          {tab === 'work_orders' && (
            <ListOrEmpty rows={workOrders} empty={lang === 'ar' ? 'لا توجد أوامر عمل لهذا الموقع.' : 'No work orders for this site.'}>
              {workOrders.map(w => (
                <Link key={w.id} href={`/dashboard/work-orders/${w.id}`}
                  className="flex justify-between items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-container-low transition-colors">
                  <span className="text-sm text-on-surface truncate">{w.title}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${STATUS_COLORS[w.status] ?? 'bg-surface-container-low text-on-surface-variant'}`}>{w.status}</span>
                </Link>
              ))}
            </ListOrEmpty>
          )}

          {tab === 'assets' && (
            <ListOrEmpty rows={assets} empty={lang === 'ar' ? 'لا توجد أصول لهذا الموقع.' : 'No assets for this site.'}>
              {assets.map(a => (
                <Link key={a.id} href={`/dashboard/assets/${a.id}`}
                  className="flex justify-between items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-container-low transition-colors">
                  <span className="text-sm text-on-surface truncate">{a.name}{a.asset_tag ? ` · ${a.asset_tag}` : ''}</span>
                  {a.status && <span className="text-xs text-on-surface-variant flex-shrink-0">{a.status}</span>}
                </Link>
              ))}
            </ListOrEmpty>
          )}

          {tab === 'parts' && (
            <ListOrEmpty rows={parts} empty={lang === 'ar' ? 'لا توجد قطع غيار لهذا الموقع.' : 'No parts stocked at this site.'}>
              {parts.map(p => (
                <Link key={p.id} href={`/dashboard/inventory/${p.id}`}
                  className="flex justify-between items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-container-low transition-colors">
                  <span className="text-sm text-on-surface truncate">{p.name}{p.sku ? ` · ${p.sku}` : ''}</span>
                  <span className="text-xs text-on-surface-variant flex-shrink-0">{p.quantity ?? 0}{p.unit ? ` ${p.unit}` : ''}</span>
                </Link>
              ))}
            </ListOrEmpty>
          )}

          {tab === 'files' && orgId && (
            <EntityFilesTab entityType="site" entityId={params.id} orgId={orgId} />
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-secondary mb-1">{label}</dt>
      <dd className="text-sm text-on-surface">
        {value ? (href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{value}</a> : value) : <span className="text-outline">—</span>}
      </dd>
    </div>
  )
}

function ListOrEmpty({ rows, empty, children }: { rows: Row[]; empty: string; children: React.ReactNode }) {
  if (rows.length === 0) return <p className="text-sm text-on-surface-variant">{empty}</p>
  return <div className="flex flex-col divide-y divide-outline-variant/40">{children}</div>
}
