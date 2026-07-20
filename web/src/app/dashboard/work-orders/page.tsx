'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isAfter } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { exportCSV } from '@/lib/csv'
import { usePagination } from '@/lib/usePagination'
import Pagination from '@/components/Pagination'

interface Technician { id: string; full_name: string }

interface WorkOrder {
  id: string
  wo_number: number
  title: string
  status: string
  priority: string
  category?: string
  created_at: string
  updated_at?: string
  completed_at?: string
  due_at?: string
  started_at?: string
  requester_name?: string
  completion_notes?: string
  estimated_duration_minutes?: number
  assigned_to?: string
  asset_id?: string
  site_id?: string
  team_id?: string
  asset?: { name: string }
  site?: { name: string }
  team?: { name: string }
  creator?: { full_name: string }
  assignee?: { full_name: string }
  vendor?: { company_name: string } | null
}

const PRIORITY_BADGE: Record<string, string> = {
  low:      'bg-primary/10 text-primary',
  medium:   'bg-[#f57f17]/10 text-[#f57f17]',
  high:     'bg-error/10 text-error',
  critical: 'bg-error text-on-error',
}

const STATUS_BADGE: Record<string, string> = {
  new:         'bg-tertiary/10 text-tertiary',
  assigned:    'bg-primary/10 text-primary',
  in_progress: 'bg-secondary/10 text-secondary',
  on_hold:     'bg-error/10 text-error',
  completed:   'bg-primary/20 text-primary',
  closed:      'bg-surface-container text-on-surface-variant',
}

function Badge({ text, cls }: { text: string; cls: string }) {
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{text}</span>
}

const CATEGORIES = ['HVAC','Electrical','Plumbing','Elevator / Lift','Fire Safety','Furniture','Kitchen Equipment','Pool / Gym','IT Equipment','Signage','Vehicle','Other']

function daysSince(iso?: string) {
  if (!iso) return ''
  return String(Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)))
}

// WO-14/WO-10/WO-30: one column model drives the table (chooser toggles which show)
// AND the CSV export picker. `get` returns the display/export string; `always` cols
// can't be hidden. Values come from work_orders columns/joins added in prior sprints.
const LIST_COLUMNS: { key: string; label: string; always?: boolean; get: (w: WorkOrder) => string }[] = [
  { key: 'wo_number',  label: 'WO #',      always: true, get: w => w.wo_number ? `WO-${String(w.wo_number).padStart(4, '0')}` : '' },
  { key: 'title',      label: 'Title',     always: true, get: w => w.title ?? '' },
  { key: 'asset',      label: 'Asset',     get: w => w.asset?.name ?? '' },
  { key: 'site',       label: 'Site',      get: w => w.site?.name ?? '' },
  { key: 'category',   label: 'Category',  get: w => w.category ?? '' },
  { key: 'priority',   label: 'Priority',  get: w => w.priority ?? '' },
  { key: 'status',     label: 'Status',    get: w => w.status ?? '' },
  { key: 'assignee',   label: 'Assigned',  get: w => w.assignee?.full_name ?? (w.vendor?.company_name ? `${w.vendor.company_name} (Vendor)` : '') },
  { key: 'team',       label: 'Team',      get: w => w.team?.name ?? '' },
  { key: 'due_at',     label: 'Due',       get: w => w.due_at ? format(new Date(w.due_at), 'yyyy-MM-dd') : '' },
  { key: 'created_at', label: 'Created',   get: w => w.created_at ? format(new Date(w.created_at), 'yyyy-MM-dd') : '' },
  { key: 'started_at', label: 'Start Date',get: w => w.started_at ? format(new Date(w.started_at), 'yyyy-MM-dd') : '' },
  { key: 'updated_at', label: 'Last Updated', get: w => w.updated_at ? format(new Date(w.updated_at), 'yyyy-MM-dd') : '' },
  { key: 'creator',    label: 'Created By', get: w => w.creator?.full_name ?? '' },
  { key: 'requester_name', label: 'Requested By', get: w => w.requester_name ?? '' },
  { key: 'est_duration', label: 'Est. Duration', get: w => w.estimated_duration_minutes ? `${(w.estimated_duration_minutes / 60).toFixed(1)}h` : '' },
  { key: 'days_since', label: 'Days Since Created', get: w => daysSince(w.created_at) },
  { key: 'completion_notes', label: 'Close-out Notes', get: w => w.completion_notes ?? '' },
]

// Columns shown in the table by default (matches the original layout). The chooser
// persists deviations from this in localStorage per browser (WO-14).
const DEFAULT_VISIBLE = ['wo_number','title','asset','site','category','priority','status','assignee','due_at','created_at']
const VISIBLE_COLS_KEY = 'wo-list-visible-cols'

export default function WorkOrdersPage() {
  const [technicians, setTechnicians] = useState<Technician[]>([])
  // WO-16: default view excludes completed/closed. 'open' is a virtual filter
  // (any status not completed/closed); real statuses filter server-side.
  const [statusFilter, setStatusFilter] = useState('open')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [technicianFilter, setTechnicianFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  // DV-14: search also matches asset/site names via pre-resolved id lists
  // (PostgREST or() can't span joined tables). `term` travels with the ids so
  // the list query never mixes a new term with stale ids.
  const [searchRef, setSearchRef] = useState<{ term: string; assetIds: string[]; siteIds: string[] }>({ term: '', assetIds: [], siteIds: [] })
  const [selected, setSelected] = useState<string[]>([])
  const [bulkTech, setBulkTech] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [savedViews, setSavedViews] = useState<any[]>([])
  const [me, setMe] = useState<{ id: string; organisation_id: string; role?: string } | null>(null)
  const [urlParsed, setUrlParsed] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exportCols, setExportCols] = useState<string[]>(LIST_COLUMNS.map(c => c.key))
  // WO-14: which table columns are visible (persisted per-browser in localStorage).
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_VISIBLE)
  const [showColumns, setShowColumns] = useState(false)
  // WO-15: this user's bookmarked WO ids + the "bookmarked only" chip.
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false)
  // WO-16: "unassigned only" quick filter (server-side; assignee null & no vendor).
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  // DV-14: KPI tiles aggregate the whole visible org, independent of filters/page.
  const [stats, setStats] = useState({ all: 0, open: 0, overdue: 0, in_progress: 0, urgent: 0, avgCompletion: '0.0' })
  const [exporting, setExporting] = useState(false)
  const supabase = createClient()
  const { t, lang } = useLanguage()

  // WO-13: seed filters from the URL once (shareable filter links), then keep the URL
  // in sync below. window.history avoids Next's useSearchParams Suspense requirement.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('status')) setStatusFilter(p.get('status')!)
    if (p.get('priority')) setPriorityFilter(p.get('priority')!)
    if (p.get('category')) setCategoryFilter(p.get('category')!)
    if (p.get('technician')) setTechnicianFilter(p.get('technician')!)
    if (p.get('from')) setDateFrom(p.get('from')!)
    if (p.get('to')) setDateTo(p.get('to')!)
    if (p.get('q')) setSearch(p.get('q')!)
    setUrlParsed(true)
    // WO-14: restore column choice for this browser.
    try {
      const saved = JSON.parse(localStorage.getItem(VISIBLE_COLS_KEY) || 'null')
      if (Array.isArray(saved) && saved.length) setVisibleCols(saved)
    } catch { /* ignore malformed */ }
    loadViews()
    loadBookmarks()
    fetchTechnicians()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Debounce search so we don't fire a query on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(id)
  }, [search])

  // DV-14: resolve the search term to matching asset/site ids (org-scoped by RLS)
  // so the main query can OR them in. The list refetches off `searchRef`, never
  // the raw term, so results always match the resolved ids.
  useEffect(() => {
    const term = debouncedSearch.trim()
    if (!term) { setSearchRef({ term: '', assetIds: [], siteIds: [] }); return }
    let cancelled = false
    const s = `%${term}%`
    Promise.all([
      supabase.from('assets').select('id').ilike('name', s).limit(100),
      supabase.from('sites').select('id').ilike('name', s).limit(100),
    ]).then(([a, si]) => {
      if (cancelled) return
      setSearchRef({
        term,
        assetIds: (a.data ?? []).map((r: { id: string }) => r.id),
        siteIds: (si.data ?? []).map((r: { id: string }) => r.id),
      })
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  // WO-14: persist column choice whenever it changes.
  useEffect(() => { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify(visibleCols)) }, [visibleCols])

  // WO-15: pull this user's bookmarks. Table may not exist yet (migration owner-run);
  // the error is swallowed so the list still loads with zero bookmarks.
  async function loadBookmarks() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('wo_bookmarks').select('work_order_id').eq('user_id', user.id)
    if (data) setBookmarks(new Set(data.map(b => b.work_order_id)))
  }

  async function toggleBookmark(woId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const next = new Set(bookmarks)
    if (bookmarks.has(woId)) {
      next.delete(woId)
      await supabase.from('wo_bookmarks').delete().eq('user_id', user.id).eq('work_order_id', woId)
    } else {
      next.add(woId)
      await supabase.from('wo_bookmarks').insert({ user_id: user.id, work_order_id: woId })
    }
    setBookmarks(next)
  }

  useEffect(() => {
    if (!urlParsed) return
    const p = new URLSearchParams()
    if (statusFilter !== 'all') p.set('status', statusFilter)
    if (priorityFilter !== 'all') p.set('priority', priorityFilter)
    if (categoryFilter !== 'all') p.set('category', categoryFilter)
    if (technicianFilter !== 'all') p.set('technician', technicianFilter)
    if (dateFrom) p.set('from', dateFrom)
    if (dateTo) p.set('to', dateTo)
    if (search) p.set('q', search)
    const qs = p.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [urlParsed, statusFilter, priorityFilter, categoryFilter, technicianFilter, dateFrom, dateTo, search])

  async function loadViews() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('id, organisation_id, role').eq('id', user.id).single()
    if (!profile) return
    setMe(profile)
    setIsManager(profile.role === 'admin' || profile.role === 'manager')
    const { data } = await supabase.from('saved_views').select('*').eq('user_id', user.id).eq('page', 'work-orders').order('name')
    if (data) setSavedViews(data)
  }

  async function saveCurrentView() {
    if (!me) return
    const name = window.prompt(lang === 'ar' ? 'اسم العرض؟' : 'View name?')
    if (!name?.trim()) return
    const filters = { status: statusFilter, priority: priorityFilter, category: categoryFilter, technician: technicianFilter, from: dateFrom, to: dateTo, q: search }
    const { error } = await supabase.from('saved_views').upsert(
      { organisation_id: me.organisation_id, user_id: me.id, page: 'work-orders', name: name.trim(), filters },
      { onConflict: 'user_id,page,name' },
    )
    if (error) { alert(error.message); return }
    await loadViews()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyView(v: any) {
    const f = v.filters ?? {}
    setStatusFilter(f.status ?? 'all')
    setPriorityFilter(f.priority ?? 'all')
    setCategoryFilter(f.category ?? 'all')
    setTechnicianFilter(f.technician ?? 'all')
    setDateFrom(f.from ?? '')
    setDateTo(f.to ?? '')
    setSearch(f.q ?? '')
  }

  async function fetchTechnicians() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('users').select('id, full_name').eq('organisation_id', profile.organisation_id).in('role', ['technician', 'manager'])
    if (data) setTechnicians(data)
  }

  const NO_ROWS = '00000000-0000-0000-0000-000000000000' // impossible id — yields an empty result

  // DV-14: every filter applies server-side so pagination + counts stay correct.
  // Shared by the paginated list query and the full-set CSV export.
  function buildQuery(withCount: boolean) {
    let q = supabase.from('work_orders')
      // WO-12: archived WOs are hidden from the list.
      .select('*, assignee:assigned_to(full_name), creator:created_by(full_name), team:team_id(name), vendor:assigned_vendor_id(company_name), asset:asset_id(name), site:site_id(name)', withCount ? { count: 'exact' } : undefined)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
    // Wait for the profile: CORE-21 technician scoping must be known before showing rows.
    if (!me) return q.eq('id', NO_ROWS)
    // CORE-21: technicians see only WOs assigned to them or where they're an additional worker.
    if (me.role === 'technician') q = q.or(`assigned_to.eq.${me.id},additional_workers.cs.{${me.id}}`)
    // WO-16: 'open' = everything except completed/closed (the default landing view).
    if (statusFilter === 'open') q = q.not('status', 'in', '(completed,closed)')
    else if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    if (priorityFilter !== 'all') q = q.eq('priority', priorityFilter)
    if (categoryFilter !== 'all') q = q.eq('category', categoryFilter)
    if (technicianFilter !== 'all') q = q.eq('assigned_to', technicianFilter)
    if (dateFrom) q = q.gte('created_at', dateFrom)
    if (dateTo) q = q.lte('created_at', dateTo + 'T23:59:59')
    // WO-15: bookmarked-only intersects with this user's bookmark ids.
    if (bookmarkedOnly) q = q.in('id', bookmarks.size ? Array.from(bookmarks) : [NO_ROWS])
    // WO-16: unassigned = no technician and no vendor.
    if (unassignedOnly) q = q.is('assigned_to', null).is('assigned_vendor_id', null)
    if (searchRef.term) {
      const s = searchRef.term.replace(/[,()]/g, ' ').trim() // or() syntax can't carry these
      const ors: string[] = []
      if (s) ors.push(`title.ilike.%${s}%`)
      const num = /^wo-?0*(\d+)$/i.exec(s) // "WO-0012" or "12" also matches the WO number
      if (num) ors.push(`wo_number.eq.${num[1]}`)
      if (searchRef.assetIds.length) ors.push(`asset_id.in.(${searchRef.assetIds.join(',')})`)
      if (searchRef.siteIds.length) ors.push(`site_id.in.(${searchRef.siteIds.join(',')})`)
      q = ors.length ? q.or(ors.join(',')) : q.eq('id', NO_ROWS)
    }
    return q
  }

  const {
    rows: filtered, total, loading, page, pageCount, from, to, hasPrev, hasNext, prev, next, refresh,
  } = usePagination<WorkOrder>(
    () => buildQuery(true),
    [me, statusFilter, priorityFilter, categoryFilter, technicianFilter, dateFrom, dateTo, searchRef, unassignedOnly, bookmarkedOnly ? bookmarks : 0],
  )

  // DV-14: whole-org KPI tiles via cheap head-count queries + a bounded sample
  // for avg completion (independent of the current filters/page, like #52).
  useEffect(() => {
    if (!me) return
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scope = (q: any) => me.role === 'technician' ? q.or(`assigned_to.eq.${me.id},additional_workers.cs.{${me.id}}`) : q
    const count = () => scope(supabase.from('work_orders').select('id', { count: 'exact', head: true }).is('archived_at', null))
    Promise.all([
      count(),
      count().not('status', 'in', '(completed,closed)'),
      count().eq('status', 'in_progress'),
      count().in('priority', ['critical', 'high']),
      count().not('status', 'in', '(completed,closed)').lt('due_at', new Date().toISOString()),
      // ponytail: avg over the 500 most recent completions; a DB aggregate if exactness matters
      scope(supabase.from('work_orders').select('created_at, completed_at').eq('status', 'completed').is('archived_at', null).order('completed_at', { ascending: false }).limit(500)),
    ]).then(([allR, openR, ipR, urgR, odR, compR]) => {
      if (cancelled) return
      const comp: { created_at: string; completed_at: string }[] = compR.data ?? []
      const avgH = comp.length
        ? comp.reduce((sum, w) => w.created_at && w.completed_at ? sum + (new Date(w.completed_at).getTime() - new Date(w.created_at).getTime()) / 3600000 : sum, 0) / comp.length
        : 0
      setStats({
        all: allR.count ?? 0,
        open: openR.count ?? 0,
        in_progress: ipR.count ?? 0,
        urgent: urgR.count ?? 0,
        overdue: odR.count ?? 0,
        avgCompletion: avgH.toFixed(1),
      })
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])

  async function handleBulkAssign() {
    if (!bulkTech || selected.length === 0) return
    setBulkAssigning(true)
    await supabase.from('work_orders').update({ assigned_to: bulkTech, status: 'assigned', updated_at: new Date().toISOString() }).in('id', selected)
    setSelected([]); setBulkTech('')
    refresh()
    setBulkAssigning(false)
  }

  function toggleSelect(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  // DV-14: select-all is page-scoped and additive, so selections survive paging.
  function toggleSelectAll() {
    const pageIds = filtered.map(w => w.id)
    const allOnPage = pageIds.length > 0 && pageIds.every(id => selected.includes(id))
    setSelected(allOnPage ? selected.filter(id => !pageIds.includes(id)) : Array.from(new Set([...selected, ...pageIds])))
  }

  // WO-10: export the current view. DV-14: fetches the FULL filtered set on demand
  // (in 1000-row chunks) — not just the current page. Checked rows, if any, are
  // intersected with the filtered set.
  async function runExport() {
    const cols = LIST_COLUMNS.filter(c => exportCols.includes(c.key))
    if (cols.length === 0) { alert(lang === 'ar' ? 'اختر عمودًا واحدًا على الأقل' : 'Pick at least one column'); return }
    setExporting(true)
    const all: WorkOrder[] = []
    for (let start = 0; ; start += 1000) {
      const { data, error } = await buildQuery(false).range(start, start + 999)
      if (error || !data) break
      all.push(...(data as WorkOrder[]))
      if (data.length < 1000) break
    }
    const source = selected.length > 0 ? all.filter(w => selected.includes(w.id)) : all
    const rows = source.map(w => {
      const o: Record<string, string> = {}
      cols.forEach(c => { o[c.label] = c.get(w) })
      return o
    })
    exportCSV(`serviq-fm-work-orders-${format(new Date(), 'yyyy-MM-dd')}.csv`, rows)
    setExporting(false)
    setShowExport(false)
  }

  const isOverdue = useCallback((wo: WorkOrder) =>
    wo.due_at && !['completed','closed'].includes(wo.status) && isAfter(new Date(), new Date(wo.due_at)), [])

  // WO-14: columns to render, in LIST_COLUMNS order, honouring the chooser.
  const shownCols = LIST_COLUMNS.filter(c => c.always || visibleCols.includes(c.key))

  const inputCls = 'bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all'

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('wo.title')}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {stats.all} total · {stats.in_progress} {t('wo.in_progress')} ·{' '}
              <span className={stats.overdue > 0 ? 'text-error font-semibold' : 'text-on-surface-variant'}>{stats.overdue} overdue</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Link href='/dashboard/work-orders/calendar'>
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined text-lg">calendar_month</span>
                {lang === 'ar' ? 'التقويم' : 'Calendar'}
              </button>
            </Link>
            <Link href='/dashboard/work-orders/templates'>
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined text-lg">description</span>
                {lang === 'ar' ? 'القوالب' : 'Templates'}
              </button>
            </Link>
            <Link href='/dashboard/work-orders/checklists'>
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
                <span className="material-symbols-outlined text-lg">checklist</span>
                {lang === 'ar' ? 'قوائم المهام' : 'Checklists'}
              </button>
            </Link>
            <button onClick={() => setShowColumns(true)}
              className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-lg">view_column</span>
              {lang === 'ar' ? 'الأعمدة' : 'Columns'}
            </button>
            <button onClick={() => setShowExport(true)}
              className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
              <span className="material-symbols-outlined text-lg">download</span>
              {lang === 'ar' ? 'تصدير' : 'Export'}
            </button>
            {isManager && (
              <Link href='/dashboard/work-orders/import'>
                <button className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-surface-container-low transition-colors">
                  <span className="material-symbols-outlined text-lg">upload</span>
                  {lang === 'ar' ? 'استيراد' : 'Import'}
                </button>
              </Link>
            )}
            <Link href='/dashboard/work-orders/new'>
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">add</span>
                {t('btn.new_wo')}
              </button>
            </Link>
          </div>
        </div>

        {/* Stats Bento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 bg-primary/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="p-2 bg-primary/10 text-primary rounded-lg w-fit mb-3">
              <span className="material-symbols-outlined">assignment</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Open Orders</p>
            <p className="text-4xl font-bold text-on-surface">{stats.open}</p>
            <p className="text-xs text-on-surface-variant mt-2">Not completed or closed</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 bg-error/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="p-2 bg-error/10 text-error rounded-lg w-fit mb-3">
              <span className="material-symbols-outlined">priority_high</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Urgent (High)</p>
            <p className="text-4xl font-bold text-error">{stats.urgent}</p>
            <p className="text-xs text-on-surface-variant mt-2">Requires attention</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 bg-secondary/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="p-2 bg-secondary/10 text-secondary rounded-lg w-fit mb-3">
              <span className="material-symbols-outlined">pending_actions</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">In Progress</p>
            <p className="text-4xl font-bold text-secondary">{stats.in_progress}</p>
            <p className="text-xs text-on-surface-variant mt-2">Currently being worked</p>
          </div>
          <div className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 bg-primary/5 rounded-full group-hover:scale-110 transition-transform duration-500" />
            <div className="p-2 bg-primary/10 text-primary rounded-lg w-fit mb-3">
              <span className="material-symbols-outlined">schedule</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">Avg. Completion</p>
            <p className="text-4xl font-bold text-on-surface">{stats.avgCompletion}h</p>
            <p className="text-xs text-on-surface-variant mt-2">Created → completed</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-4 space-y-3">
          {/* WO-13: saved views — apply / save / delete; the URL always mirrors the filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value=""
              onChange={e => { const v = savedViews.find(sv => sv.id === e.target.value); if (v) applyView(v) }}
              className={`${inputCls} cursor-pointer`}
              aria-label="Saved views"
            >
              <option value="">{lang === 'ar' ? 'العروض المحفوظة…' : 'Saved views…'}</option>
              {savedViews.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button onClick={saveCurrentView}
              className="border border-outline-variant text-on-surface-variant px-3 py-2 rounded-xl text-xs font-semibold hover:bg-surface-container-low transition-colors">
              {lang === 'ar' ? 'حفظ العرض الحالي' : 'Save current view'}
            </button>
            {savedViews.length > 0 && (
              <button onClick={async () => {
                const name = window.prompt(lang === 'ar' ? 'اسم العرض المراد حذفه؟' : 'Name of the view to delete?')
                if (!name?.trim()) return
                await supabase.from('saved_views').delete().eq('user_id', me?.id ?? '').eq('page', 'work-orders').eq('name', name.trim())
                await loadViews()
              }} className="border border-outline-variant text-error px-3 py-2 rounded-xl text-xs font-semibold hover:bg-error/10 transition-colors">
                {lang === 'ar' ? 'حذف عرض' : 'Delete a view'}
              </button>
            )}
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('wo.search')} aria-label="Search work orders"
            className={`${inputCls} w-full`}
          />

          {/* Status filter — 'open' is the default (excludes completed/closed) per WO-16 */}
          <div className="flex flex-wrap gap-2">
            {['open','all','new','assigned','in_progress','on_hold','completed','closed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  statusFilter === s ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:border-primary/50 hover:text-primary'
                }`}>
                {s === 'all' ? t('common.all') : s === 'open' ? (lang === 'ar' ? 'مفتوح' : 'Open') : s.replace('_', ' ')}
              </button>
            ))}
            {/* WO-16: Unassigned quick filter + WO-15: Bookmarked quick filter */}
            <button onClick={() => setUnassignedOnly(v => !v)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                unassignedOnly ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:border-primary/50 hover:text-primary'
              }`}>
              {lang === 'ar' ? 'غير مُسند' : 'Unassigned'}
            </button>
            <button onClick={() => setBookmarkedOnly(v => !v)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all flex items-center gap-1 ${
                bookmarkedOnly ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:border-primary/50 hover:text-primary'
              }`}>
              <span className="material-symbols-outlined text-sm">star</span>
              {lang === 'ar' ? 'المفضلة' : 'Bookmarked'}
            </button>
          </div>

          {/* Priority + secondary filters */}
          <div className="flex flex-wrap gap-2 items-center">
            {['all','critical','high','medium','low'].map(p => (
              <button key={p} onClick={() => setPriorityFilter(p)}
                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                  priorityFilter === p ? 'bg-on-surface text-surface-container-lowest border-on-surface' : 'bg-surface-container-low text-on-surface-variant border-outline-variant/40 hover:border-primary/50 hover:text-primary'
                }`}>
                {p === 'all' ? t('filter.all_priorities') : p}
              </button>
            ))}

            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value='all'>{t('filter.all_cats')}</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select value={technicianFilter} onChange={e => setTechnicianFilter(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value='all'>{t('filter.all_techs')}</option>
              {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
            </select>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-on-surface-variant">From</span>
              <input type='date' value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={`${inputCls} cursor-pointer`} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-on-surface-variant">To</span>
              <input type='date' value={dateTo} onChange={e => setDateTo(e.target.value)} className={`${inputCls} cursor-pointer`} />
            </div>

            {(categoryFilter !== 'all' || technicianFilter !== 'all' || dateFrom || dateTo || bookmarkedOnly || unassignedOnly) && (
              <button onClick={() => { setCategoryFilter('all'); setTechnicianFilter('all'); setDateFrom(''); setDateTo(''); setBookmarkedOnly(false); setUnassignedOnly(false) }}
                className="px-3 py-1.5 rounded-xl border border-error/30 text-error text-xs font-semibold hover:bg-error/5 transition-colors">
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Bulk assign bar */}
        {selected.length > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-primary">{selected.length} work order{selected.length > 1 ? 's' : ''} selected</span>
            <select value={bulkTech} onChange={e => setBulkTech(e.target.value)} className={inputCls}>
              <option value=''>Select technician to assign...</option>
              {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
            </select>
            <button onClick={handleBulkAssign} disabled={!bulkTech || bulkAssigning}
              className="px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors">
              {bulkAssigning ? 'Assigning...' : 'Assign All'}
            </button>
            <button onClick={() => setSelected([])} className="px-4 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">
              Cancel
            </button>
          </div>
        )}

        {/* Table */}
        {loading || !me ? (
          <div className="text-on-surface-variant py-8 text-center">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">assignment</span>
            <p className="text-lg font-semibold mb-1">No work orders found</p>
            <p className="text-sm">Try adjusting your filters or create a new work order</p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container border-b border-outline-variant/30">
                    <th className="p-3 w-10">
                      <input type='checkbox' checked={filtered.length > 0 && filtered.every(w => selected.includes(w.id))} onChange={toggleSelectAll} className="rounded" />
                    </th>
                    <th className="p-3 w-10" aria-label="Bookmark" />
                    {shownCols.map(c => (
                      <th key={c.key} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {filtered.map(wo => {
                    const overdue = isOverdue(wo)
                    const isSelected = selected.includes(wo.id)
                    const marked = bookmarks.has(wo.id)
                    return (
                      <tr key={wo.id} className={`transition-colors hover:bg-surface-container-low ${isSelected ? 'bg-primary/5' : overdue ? 'bg-error/5' : ''}`}>
                        <td className="p-3">
                          <input type='checkbox' checked={isSelected} onChange={() => toggleSelect(wo.id)} className="rounded" />
                        </td>
                        <td className="p-3">
                          <button onClick={() => toggleBookmark(wo.id)} aria-label={marked ? 'Remove bookmark' : 'Bookmark'}
                            className={`material-symbols-outlined text-lg align-middle ${marked ? 'text-[#f57f17]' : 'text-outline-variant hover:text-[#f57f17]'}`}
                            style={marked ? { fontVariationSettings: "'FILL' 1" } : undefined}>
                            star
                          </button>
                        </td>
                        {shownCols.map(c => {
                          if (c.key === 'title') return (
                            <td key={c.key} className="p-3 max-w-[200px]">
                              <Link href={'/dashboard/work-orders/' + wo.id} className="text-sm font-semibold text-primary hover:underline truncate block">{wo.title}</Link>
                              {overdue && <span className="text-[10px] text-error bg-error/10 px-1.5 py-0.5 rounded-full font-semibold">Overdue</span>}
                            </td>
                          )
                          if (c.key === 'wo_number') return (
                            <td key={c.key} className="p-3 text-xs font-mono text-on-surface-variant whitespace-nowrap">{c.get(wo) || '—'}</td>
                          )
                          if (c.key === 'priority') return (
                            <td key={c.key} className="p-3 whitespace-nowrap"><Badge text={wo.priority} cls={PRIORITY_BADGE[wo.priority] ?? PRIORITY_BADGE.medium} /></td>
                          )
                          if (c.key === 'status') return (
                            <td key={c.key} className="p-3 whitespace-nowrap"><Badge text={wo.status.replace('_', ' ')} cls={STATUS_BADGE[wo.status] ?? STATUS_BADGE.new} /></td>
                          )
                          if (c.key === 'assignee') return (
                            <td key={c.key} className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{c.get(wo) || t('common.unassigned')}</td>
                          )
                          if (c.key === 'due_at') return (
                            <td key={c.key} className={`p-3 text-sm whitespace-nowrap ${overdue ? 'text-error font-semibold' : 'text-on-surface-variant'}`}>{wo.due_at ? format(new Date(wo.due_at), 'dd MMM yyyy') : '—'}</td>
                          )
                          if (c.key === 'completion_notes') return (
                            <td key={c.key} className="p-3 text-sm text-on-surface-variant max-w-[220px]"><span className="truncate block">{c.get(wo) || '—'}</span></td>
                          )
                          return <td key={c.key} className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{c.get(wo) || '—'}</td>
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* DV-14: server-side pagination controls */}
            <div className="px-4 pb-4 border-t border-outline-variant/20">
              <Pagination page={page} pageCount={pageCount} from={from} to={to} total={total}
                hasPrev={hasPrev} hasNext={hasNext} prev={prev} next={next}
                label={lang === 'ar' ? 'أوامر العمل' : 'work orders'} />
            </div>
          </div>
        )}

      </div>

      {/* WO-10: export column picker */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowExport(false)}>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-on-surface mb-1">{lang === 'ar' ? 'تصدير إلى CSV' : 'Export to CSV'}</h2>
            <p className="text-sm text-on-surface-variant mb-4">
              {(() => {
                // DV-14: export pulls the FULL filtered set from the server, so the
                // count is the total match count — or the checked rows if any.
                const sel = selected.length > 0
                const n = sel ? selected.length : total
                return lang === 'ar'
                  ? `${n} ${sel ? 'صف محدد' : 'صف (بعد التصفية)'}`
                  : `${n} ${sel ? 'selected' : 'filtered'} row${n !== 1 ? 's' : ''}`
              })()}
            </p>
            <div className="grid grid-cols-2 gap-2 mb-5 max-h-64 overflow-y-auto">
              {LIST_COLUMNS.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
                  <input type="checkbox" checked={exportCols.includes(c.key)}
                    onChange={() => setExportCols(prev => prev.includes(c.key) ? prev.filter(k => k !== c.key) : [...prev, c.key])}
                    className="rounded" />
                  {c.label}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowExport(false)} className="px-4 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button onClick={runExport} disabled={exporting}
                className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {exporting ? (lang === 'ar' ? 'جارٍ التصدير…' : 'Exporting…') : (lang === 'ar' ? 'تنزيل CSV' : 'Download CSV')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WO-14: table column chooser (persists per-browser via localStorage) */}
      {showColumns && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowColumns(false)}>
          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-on-surface mb-1">{lang === 'ar' ? 'أعمدة الجدول' : 'Table columns'}</h2>
            <p className="text-sm text-on-surface-variant mb-4">{lang === 'ar' ? 'اختر الأعمدة المرئية' : 'Choose which columns are visible'}</p>
            <div className="grid grid-cols-2 gap-2 mb-5 max-h-72 overflow-y-auto">
              {LIST_COLUMNS.map(c => (
                <label key={c.key} className={`flex items-center gap-2 text-sm text-on-surface ${c.always ? 'opacity-50' : 'cursor-pointer'}`}>
                  <input type="checkbox" disabled={c.always} checked={c.always || visibleCols.includes(c.key)}
                    onChange={() => setVisibleCols(prev => prev.includes(c.key) ? prev.filter(k => k !== c.key) : [...prev, c.key])}
                    className="rounded" />
                  {c.label}
                </label>
              ))}
            </div>
            <div className="flex justify-between gap-2">
              <button onClick={() => setVisibleCols(DEFAULT_VISIBLE)} className="px-4 py-2 rounded-xl border border-outline-variant/40 text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors">
                {lang === 'ar' ? 'إعادة التعيين' : 'Reset'}
              </button>
              <button onClick={() => setShowColumns(false)} className="px-5 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary/90 transition-colors">
                {lang === 'ar' ? 'تم' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
