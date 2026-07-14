'use client'

// AG-5 — Asset Log item detail. Header badges/banners, quick actions
// (QR modal via client qrcode.toDataURL, Move via move_asset_log_item RPC on the
// AUTHENTICATED browser client — the RPC reads auth.uid(), Commission/Decommission,
// status buttons, Edit) and tabs: Overview / Costs / Repairs / Movements /
// Warranty / Condition.

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import {
  currentValue, isWarrantyExpiringSoon, isWarrantyExpired, isReviewDue,
  ASSET_LOG_STATUSES,
} from '@/lib/asset-log'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

const STATUS_CLASSES: Record<string, string> = {
  in_storage:   'bg-surface-container-high text-on-surface-variant',
  in_use:       'bg-primary-container/90 text-on-primary-container',
  under_repair: 'bg-secondary-container/90 text-on-secondary-container',
  damaged:      'bg-error/10 text-error',
  disposed:     'bg-surface-container-high text-on-surface-variant/70',
}

type Tab = 'overview' | 'costs' | 'repairs' | 'movements' | 'warranty' | 'condition'

export default function AssetLogDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const isAr = lang === 'ar'

  const [item, setItem] = useState<Row | null>(null)
  const [movements, setMovements] = useState<Row[]>([])
  const [repairs, setRepairs] = useState<Row[]>([])
  const [reviews, setReviews] = useState<Row[]>([])
  const [spaces, setSpaces] = useState<Row[]>([])
  const [vendors, setVendors] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const [qrUrl, setQrUrl] = useState('')
  const [showMove, setShowMove] = useState(false)
  const [showDecom, setShowDecom] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const [itemRes, movRes, repRes, revRes, spacesRes, vendorsRes] = await Promise.all([
      supabase.from('asset_log_items')
        .select('*, type:type_id(id, name, name_ar), site:site_id(id, name), space:space_id(id, name, floor), supplier:supplier_id(id, name)')
        .eq('id', id).maybeSingle(),
      supabase.from('asset_log_movements').select('*').eq('item_id', id).order('moved_at', { ascending: false }),
      supabase.from('asset_log_repairs').select('*, vendor:vendor_id(id, name)').eq('item_id', id).order('repaired_at', { ascending: false }),
      supabase.from('asset_log_condition_reviews').select('*').eq('item_id', id).order('reviewed_at', { ascending: false }),
      supabase.from('spaces').select('id, name, site_id, floor, site:site_id(id, name)').order('name'),
      supabase.from('vendors').select('id, name').order('name'),
    ])
    if (!itemRes.data) { setNotFound(true); setLoading(false); return }
    setItem(itemRes.data)
    setMovements(movRes.data ?? [])
    setRepairs(repRes.data ?? [])
    setReviews(revRes.data ?? [])
    setSpaces(spacesRes.data ?? [])
    setVendors(vendorsRes.data ?? [])
    setLoading(false)
  }

  async function openQr() {
    if (!item) return
    setQrUrl(await QRCode.toDataURL(`${APP_URL}/al/${item.qr_token}`, { width: 240, margin: 2 }))
  }

  async function setStatus(status: string) {
    if (!item) return
    setBusy(true); setErr('')
    const res = await fetch('/api/asset-log/' + id, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setBusy(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Failed'); return }
    load()
  }

  const money = (n: number) => `SAR ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
  const al = (n: number) => 'AL-' + String(n).padStart(4, '0')

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>
  if (notFound || !item) {
    return (
      <div className="p-8">
        <Link href="/dashboard/asset-log" className="text-primary hover:underline text-sm">← {t('asset_log.title')}</Link>
        <p className="mt-4 text-on-surface-variant">{t('asset_log.empty')}</p>
      </div>
    )
  }

  const val = currentValue(item)
  const soon = isWarrantyExpiringSoon(item.warranty_expiry)
  const expired = isWarrantyExpired(item.warranty_expiry)
  const reviewDue = isReviewDue(item)
  const loc = item.space ? `${item.site?.name ?? '—'} → ${item.space.name}` : (item.site?.name ?? t('asset_log.unassigned'))
  const canDelete = item.status === 'disposed'

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',  label: isAr ? 'نظرة عامة' : 'Overview' },
    { key: 'costs',     label: isAr ? 'التكاليف' : 'Costs' },
    { key: 'repairs',   label: isAr ? 'الإصلاحات' : 'Repairs' },
    { key: 'movements', label: isAr ? 'الحركات' : 'Movements' },
    { key: 'warranty',  label: t('asset_log.col.warranty') },
    { key: 'condition', label: t('asset_log.col.condition') },
  ]

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-[1100px] mx-auto">
        <Link href="/dashboard/asset-log" className="text-primary hover:underline text-sm">← {t('asset_log.title')}</Link>

        {/* Header */}
        <div className="mt-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-on-surface">{item.name}</h1>
              <span className="text-sm font-mono text-on-surface-variant">{al(item.item_number)}</span>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASSES[item.status] ?? STATUS_CLASSES.in_storage}`}>
                {t('asset_log.status.' + item.status)}
              </span>
            </div>
            {item.name_ar && <p className="text-on-surface-variant mt-0.5" dir="rtl">{item.name_ar}</p>}
            <p className="text-sm text-on-surface-variant mt-1">
              {item.type ? (isAr && item.type.name_ar ? item.type.name_ar : item.type.name) : '—'} · {loc}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={openQr} className="px-3 py-2 rounded-xl text-sm font-semibold border border-outline-variant text-on-surface hover:bg-surface-container-low">QR</button>
            <button onClick={() => setShowMove(true)} className="px-3 py-2 rounded-xl text-sm font-semibold border border-outline-variant text-on-surface hover:bg-surface-container-low">{isAr ? 'نقل' : 'Move'}</button>
            {item.status === 'disposed'
              ? <button onClick={() => recommission()} disabled={busy} className="px-3 py-2 rounded-xl text-sm font-semibold border border-outline-variant text-on-surface hover:bg-surface-container-low">{isAr ? 'إعادة تشغيل' : 'Commission'}</button>
              : <button onClick={() => setShowDecom(true)} className="px-3 py-2 rounded-xl text-sm font-semibold border border-error/40 text-error hover:bg-error/5">{isAr ? 'إيقاف' : 'Decommission'}</button>}
            <Link href={`/dashboard/asset-log/${id}/edit`} className="px-3 py-2 rounded-xl text-sm font-semibold bg-primary text-on-primary hover:bg-primary/90">{t('common.edit') || 'Edit'}</Link>
          </div>
        </div>

        {/* Banners */}
        <div className="flex flex-col gap-2 mt-4">
          {expired && <Banner tone="error">{isAr ? 'انتهى الضمان' : 'Warranty expired'} — {item.warranty_expiry}</Banner>}
          {!expired && soon && <Banner tone="warn">{isAr ? 'الضمان ينتهي قريباً' : 'Warranty expiring soon'} — {item.warranty_expiry}</Banner>}
          {reviewDue && <Banner tone="warn">{isAr ? 'مراجعة الحالة مستحقة' : 'Condition review due'}</Banner>}
          {item.is_usable === false && <Banner tone="error">{t('asset_log.not_usable')}</Banner>}
        </div>

        {/* Status quick-switch */}
        {item.status !== 'disposed' && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {ASSET_LOG_STATUSES.filter(s => s !== 'disposed').map(s => (
              <button key={s} onClick={() => setStatus(s)} disabled={busy || s === item.status}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${s === item.status ? 'bg-primary/10 text-primary border-primary/30' : 'bg-surface-container-low text-on-surface-variant border-transparent hover:border-outline-variant'}`}>
                {t('asset_log.status.' + s)}
              </button>
            ))}
          </div>
        )}
        {err && <p className="text-error text-sm mt-2">{err}</p>}

        {/* Tabs */}
        <div className="mt-6 border-b border-outline-variant/40 flex gap-1 overflow-x-auto">
          {tabs.map(tb => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === tb.key ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}>
              {tb.label}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {tab === 'overview' && <OverviewTab item={item} isAr={isAr} />}
          {tab === 'costs' && <CostsTab item={item} val={val} money={money} isAr={isAr} />}
          {tab === 'repairs' && <RepairsTab id={id} repairs={repairs} vendors={vendors} money={money} isAr={isAr} onDone={load} />}
          {tab === 'movements' && <MovementsTab movements={movements} isAr={isAr} />}
          {tab === 'warranty' && <WarrantyTab item={item} isAr={isAr} />}
          {tab === 'condition' && <ConditionTab id={id} item={item} reviews={reviews} isAr={isAr} onDone={load} />}
        </div>

        {canDelete && (
          <div className="mt-8 pt-4 border-t border-outline-variant/40">
            <button onClick={() => del()} disabled={busy} className="text-error text-sm font-semibold hover:underline">
              {isAr ? 'حذف نهائي' : 'Delete permanently'}
            </button>
          </div>
        )}
      </div>

      {/* QR modal */}
      {qrUrl && (
        <Modal onClose={() => setQrUrl('')}>
          <div className="text-center">
            <h3 className="font-semibold text-on-surface mb-3">{al(item.item_number)} — {item.name}</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR" className="mx-auto" width={240} height={240} />
            <p className="text-xs text-on-surface-variant mt-2 break-all">{`${APP_URL}/al/${item.qr_token}`}</p>
            <a href={qrUrl} download={al(item.item_number) + '.png'} className="inline-block mt-3 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold">{isAr ? 'تنزيل' : 'Download'}</a>
          </div>
        </Modal>
      )}

      {/* Move modal */}
      {showMove && (
        <MoveModal item={item} spaces={spaces} isAr={isAr} onClose={() => setShowMove(false)} onDone={() => { setShowMove(false); load() }} />
      )}

      {/* Decommission modal */}
      {showDecom && (
        <DecommissionModal id={id} isAr={isAr} onClose={() => setShowDecom(false)} onDone={() => { setShowDecom(false); load() }} />
      )}
    </div>
  )

  async function recommission() {
    setBusy(true); setErr('')
    const res = await fetch('/api/asset-log/' + id + '/decommission', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommission: true }),
    })
    setBusy(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Failed'); return }
    load()
  }

  async function del() {
    if (!confirm(isAr ? 'حذف هذا العنصر نهائياً؟' : 'Permanently delete this item?')) return
    setBusy(true); setErr('')
    const res = await fetch('/api/asset-log/' + id, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Failed'); return }
    router.push('/dashboard/asset-log')
  }
}

function Banner({ tone, children }: { tone: 'error' | 'warn'; children: React.ReactNode }) {
  const cls = tone === 'error' ? 'bg-error/10 text-error border-error/30' : 'bg-[#fff8e1] text-[#8a6d00] border-[#f0d97a]'
  return <div className={`px-4 py-2 rounded-xl text-sm font-medium border ${cls}`}>{children}</div>
}

const cardCls = 'bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-0.5">{label}</div>
      <div className="text-sm text-on-surface">{value ?? '—'}</div>
    </div>
  )
}

function OverviewTab({ item, isAr }: { item: Row; isAr: boolean }) {
  const custom = item.custom_fields && typeof item.custom_fields === 'object' ? Object.entries(item.custom_fields) : []
  return (
    <div className={cardCls}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label={isAr ? 'العلامة' : 'Brand'} value={item.brand} />
        <Field label={isAr ? 'الموديل' : 'Model'} value={item.model} />
        <Field label={isAr ? 'الرقم التسلسلي' : 'Serial'} value={item.serial_number} />
        <Field label={isAr ? 'وضع التتبع' : 'Tracking'} value={item.tracking_mode} />
        <Field label={isAr ? 'الكمية' : 'Quantity'} value={item.quantity} />
        <Field label={isAr ? 'قابل للاستخدام' : 'Usable'} value={item.is_usable === false ? (isAr ? 'لا' : 'No') : (isAr ? 'نعم' : 'Yes')} />
      </div>
      {item.description && (
        <div className="mt-4">
          <Field label={isAr ? 'الوصف' : 'Description'} value={item.description} />
        </div>
      )}
      {custom.length > 0 && (
        <div className="mt-4 pt-4 border-t border-outline-variant/30 grid grid-cols-2 md:grid-cols-3 gap-4">
          {custom.map(([k, v]) => <Field key={k} label={k} value={String(v ?? '')} />)}
        </div>
      )}
      {Array.isArray(item.photo_urls) && item.photo_urls.length > 0 && (
        <div className="mt-4 flex gap-2 flex-wrap">
          {item.photo_urls.map((u: string, i: number) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt="" className="w-24 h-24 object-cover rounded-lg border border-outline-variant" />
          ))}
        </div>
      )}
    </div>
  )
}

function CostsTab({ item, val, money, isAr }: { item: Row; val: number | null; money: (n: number) => string; isAr: boolean }) {
  return (
    <div className={cardCls}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label={isAr ? 'تاريخ الشراء' : 'Purchase date'} value={item.purchase_date} />
        <Field label={isAr ? 'تكلفة الشراء' : 'Purchase cost'} value={item.purchase_cost != null ? money(Number(item.purchase_cost)) : '—'} />
        <Field label={isAr ? 'تكلفة الاستبدال' : 'Replacement cost'} value={item.replacement_cost != null ? money(Number(item.replacement_cost)) : '—'} />
        <Field label={isAr ? 'العمر المتوقع' : 'Lifespan (yrs)'} value={item.expected_lifespan_years} />
        <Field label={isAr ? 'المورد' : 'Supplier'} value={item.supplier?.name} />
        <Field label={isAr ? 'مرجع الفاتورة' : 'Invoice ref'} value={item.invoice_ref} />
      </div>
      <div className="mt-4 pt-4 border-t border-outline-variant/30">
        <Field
          label={isAr ? 'القيمة الحالية' : 'Current value'}
          value={
            <span className="text-lg font-bold">
              {val != null ? money(val) : '—'}
              {item.current_value_override != null
                ? <span className="ml-2 text-xs font-normal text-on-surface-variant">({isAr ? 'تجاوز يدوي' : 'manual override'})</span>
                : (item.purchase_cost != null ? <span className="ml-2 text-xs font-normal text-on-surface-variant">({isAr ? 'إهلاك خطي' : 'straight-line'})</span> : null)}
            </span>
          }
        />
      </div>
    </div>
  )
}

function WarrantyTab({ item, isAr }: { item: Row; isAr: boolean }) {
  return (
    <div className={cardCls}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Field label={isAr ? 'المزوّد' : 'Provider'} value={item.warranty_provider} />
        <Field label={isAr ? 'تاريخ الانتهاء' : 'Expiry'} value={item.warranty_expiry} />
      </div>
    </div>
  )
}

function MovementsTab({ movements, isAr }: { movements: Row[]; isAr: boolean }) {
  if (movements.length === 0) return <Empty>{isAr ? 'لا توجد حركات' : 'No movements yet'}</Empty>
  return (
    <div className={cardCls + ' p-0 overflow-hidden'}>
      <table className="w-full">
        <thead><tr className="bg-surface-container border-b border-outline-variant/30 text-xs uppercase tracking-wider text-on-surface-variant">
          <Th>{isAr ? 'من' : 'From'}</Th><Th>{isAr ? 'إلى' : 'To'}</Th><Th>{isAr ? 'ملاحظة' : 'Note'}</Th><Th>{isAr ? 'التاريخ' : 'When'}</Th>
        </tr></thead>
        <tbody className="divide-y divide-outline-variant/20">
          {movements.map(m => (
            <tr key={m.id} className="text-sm">
              <Td>{m.from_space_name ?? '—'}</Td>
              <Td>{m.to_space_name ?? (isAr ? 'غير مخصص' : 'Unassigned')}</Td>
              <Td>{m.note ?? '—'}</Td>
              <Td>{new Date(m.moved_at).toLocaleDateString()}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RepairsTab({ id, repairs, vendors, money, isAr, onDone }: { id: string; repairs: Row[]; vendors: Row[]; money: (n: number) => string; isAr: boolean; onDone: () => void }) {
  const [desc, setDesc] = useState('')
  const [cost, setCost] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function add() {
    if (!desc.trim()) { setErr(isAr ? 'الوصف مطلوب' : 'Description required'); return }
    setBusy(true); setErr('')
    const res = await fetch('/api/asset-log/' + id + '/repairs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc, cost, vendor_id: vendorId || undefined, repaired_at: date || undefined }),
    })
    setBusy(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Failed'); return }
    setDesc(''); setCost(''); setVendorId(''); setDate('')
    onDone()
  }

  const total = repairs.reduce((s, r) => s + Number(r.cost ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className={cardCls}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder={isAr ? 'وصف الإصلاح' : 'Repair description'} className="px-3 py-2 border border-outline-variant/40 rounded-xl text-sm md:col-span-2" />
          <input value={cost} onChange={e => setCost(e.target.value)} type="number" placeholder={isAr ? 'التكلفة' : 'Cost'} className="px-3 py-2 border border-outline-variant/40 rounded-xl text-sm" />
          <input value={date} onChange={e => setDate(e.target.value)} type="date" className="px-3 py-2 border border-outline-variant/40 rounded-xl text-sm" />
          <select value={vendorId} onChange={e => setVendorId(e.target.value)} className="px-3 py-2 border border-outline-variant/40 rounded-xl text-sm md:col-span-2">
            <option value="">{isAr ? 'بدون مورد' : 'No vendor'}</option>
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        {err && <p className="text-error text-sm mt-2">{err}</p>}
        <button onClick={add} disabled={busy} className="mt-3 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-60">
          {isAr ? 'إضافة إصلاح' : 'Add repair'}
        </button>
      </div>

      {repairs.length === 0 ? <Empty>{isAr ? 'لا توجد إصلاحات' : 'No repairs yet'}</Empty> : (
        <div className={cardCls + ' p-0 overflow-hidden'}>
          <table className="w-full">
            <thead><tr className="bg-surface-container border-b border-outline-variant/30 text-xs uppercase tracking-wider text-on-surface-variant">
              <Th>{isAr ? 'الوصف' : 'Description'}</Th><Th>{isAr ? 'المورد' : 'Vendor'}</Th><Th>{isAr ? 'التكلفة' : 'Cost'}</Th><Th>{isAr ? 'التاريخ' : 'Date'}</Th>
            </tr></thead>
            <tbody className="divide-y divide-outline-variant/20">
              {repairs.map(r => (
                <tr key={r.id} className="text-sm">
                  <Td>{r.description}</Td><Td>{r.vendor?.name ?? '—'}</Td><Td>{money(Number(r.cost ?? 0))}</Td><Td>{r.repaired_at}</Td>
                </tr>
              ))}
              <tr className="text-sm font-semibold bg-surface-container/40">
                <Td>{isAr ? 'الإجمالي' : 'Total'}</Td><Td>{''}</Td><Td>{money(total)}</Td><Td>{''}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ConditionTab({ id, item, reviews, isAr, onDone }: { id: string; item: Row; reviews: Row[]; isAr: boolean; onDone: () => void }) {
  const [rating, setRating] = useState(String(item.condition_rating ?? '3'))
  const [usable, setUsable] = useState(item.is_usable !== false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function log() {
    setBusy(true); setErr('')
    const res = await fetch('/api/asset-log/' + id + '/condition-reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: parseInt(rating, 10), is_usable: usable, notes: notes || undefined }),
    })
    setBusy(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Failed'); return }
    setNotes('')
    onDone()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={cardCls}>
        <div className="text-sm font-semibold text-on-surface mb-3">{isAr ? 'تسجيل مراجعة' : 'Log review'}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-on-surface-variant">{isAr ? 'التقييم' : 'Rating'}</label>
            <select value={rating} onChange={e => setRating(e.target.value)} className="w-full px-3 py-2 border border-outline-variant/40 rounded-xl text-sm">
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-on-surface-variant">{isAr ? 'قابل للاستخدام' : 'Usable'}</label>
            <select value={usable ? 'yes' : 'no'} onChange={e => setUsable(e.target.value === 'yes')} className="w-full px-3 py-2 border border-outline-variant/40 rounded-xl text-sm">
              <option value="yes">{isAr ? 'نعم' : 'Yes'}</option>
              <option value="no">{isAr ? 'لا' : 'No'}</option>
            </select>
          </div>
        </div>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder={isAr ? 'ملاحظات' : 'Notes'} className="w-full mt-3 px-3 py-2 border border-outline-variant/40 rounded-xl text-sm" />
        {err && <p className="text-error text-sm mt-2">{err}</p>}
        <button onClick={log} disabled={busy} className="mt-3 px-4 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold disabled:opacity-60">
          {isAr ? 'تسجيل' : 'Log review'}
        </button>
      </div>

      {reviews.length === 0 ? <Empty>{isAr ? 'لا توجد مراجعات' : 'No reviews yet'}</Empty> : (
        <div className={cardCls + ' p-0 overflow-hidden'}>
          <table className="w-full">
            <thead><tr className="bg-surface-container border-b border-outline-variant/30 text-xs uppercase tracking-wider text-on-surface-variant">
              <Th>{isAr ? 'التقييم' : 'Rating'}</Th><Th>{isAr ? 'قابل للاستخدام' : 'Usable'}</Th><Th>{isAr ? 'ملاحظات' : 'Notes'}</Th><Th>{isAr ? 'التاريخ' : 'When'}</Th>
            </tr></thead>
            <tbody className="divide-y divide-outline-variant/20">
              {reviews.map(r => (
                <tr key={r.id} className="text-sm">
                  <Td><span className="text-[#f57f17]">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span></Td>
                  <Td>{r.is_usable ? (isAr ? 'نعم' : 'Yes') : (isAr ? 'لا' : 'No')}</Td>
                  <Td>{r.notes ?? '—'}</Td>
                  <Td>{new Date(r.reviewed_at).toLocaleDateString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MoveModal({ item, spaces, isAr, onClose, onDone }: { item: Row; spaces: Row[]; isAr: boolean; onClose: () => void; onDone: () => void }) {
  const supabase = createClient()
  const [spaceId, setSpaceId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function move() {
    setBusy(true); setErr('')
    // Authenticated browser client — the RPC reads auth.uid() for org scoping.
    const { error } = await supabase.rpc('move_asset_log_item', {
      p_item_id: item.id,
      p_to_space_id: spaceId || null,
      p_note: note || null,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    onDone()
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold text-on-surface mb-3">{isAr ? 'نقل العنصر' : 'Move item'}</h3>
      <label className="text-xs text-on-surface-variant">{isAr ? 'إلى المساحة' : 'To space'}</label>
      <select value={spaceId} onChange={e => setSpaceId(e.target.value)} className="w-full px-3 py-2 border border-outline-variant/40 rounded-xl text-sm mb-3">
        <option value="">{isAr ? 'غير مخصص (تخزين)' : 'Unassigned (storage)'}</option>
        {spaces.map(s => <option key={s.id} value={s.id}>{s.site?.name ? s.site.name + ' → ' : ''}{s.name}{s.floor ? ' (' + s.floor + ')' : ''}</option>)}
      </select>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder={isAr ? 'ملاحظة (اختياري)' : 'Note (optional)'} className="w-full px-3 py-2 border border-outline-variant/40 rounded-xl text-sm" />
      {err && <p className="text-error text-sm mt-2">{err}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold border border-outline-variant">{isAr ? 'إلغاء' : 'Cancel'}</button>
        <button onClick={move} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-on-primary disabled:opacity-60">{isAr ? 'نقل' : 'Move'}</button>
      </div>
    </Modal>
  )
}

function DecommissionModal({ id, isAr, onClose, onDone }: { id: string; isAr: boolean; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    setBusy(true); setErr('')
    const res = await fetch('/api/asset-log/' + id + '/decommission', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, reason, disposal_notes: notes }),
    })
    setBusy(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Failed'); return }
    onDone()
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold text-on-surface mb-3">{isAr ? 'إيقاف تشغيل العنصر' : 'Decommission item'}</h3>
      <label className="text-xs text-on-surface-variant">{isAr ? 'التاريخ' : 'Date'}</label>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 border border-outline-variant/40 rounded-xl text-sm mb-3" />
      <label className="text-xs text-on-surface-variant">{isAr ? 'السبب' : 'Reason'}</label>
      <input value={reason} onChange={e => setReason(e.target.value)} className="w-full px-3 py-2 border border-outline-variant/40 rounded-xl text-sm mb-3" />
      <label className="text-xs text-on-surface-variant">{isAr ? 'ملاحظات التخلص' : 'Disposal notes'}</label>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-outline-variant/40 rounded-xl text-sm" />
      {err && <p className="text-error text-sm mt-2">{err}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold border border-outline-variant">{isAr ? 'إلغاء' : 'Cancel'}</button>
        <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-semibold bg-error text-white disabled:opacity-60">{isAr ? 'إيقاف' : 'Decommission'}</button>
      </div>
    </Modal>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-surface-container-lowest rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center py-10 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-xl">{children}</div>
}
const Th = ({ children }: { children: React.ReactNode }) => <th className="p-3 text-left font-semibold whitespace-nowrap">{children}</th>
const Td = ({ children }: { children: React.ReactNode }) => <td className="p-3 text-on-surface">{children}</td>
