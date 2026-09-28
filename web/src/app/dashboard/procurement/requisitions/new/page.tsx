// web/src/app/dashboard/procurement/requisitions/new/page.tsx
// P1: raise a requisition. Line-item form mirroring purchase-orders/new, with a
// free-text description fallback so you can request something that isn't an
// inventory item yet.
//
// P9: two tabs on ONE requisition — "Items needed" (purchase lines, which become
// a PO) and "Consumables in stock" (stock lines, issued from inventory on
// approval). The stock tab is a picker: photo, what is actually available
// (stock minus what other requisitions hold) and a quantity stepper capped at
// that number. The cap is a courtesy, not the control: the real check is the
// row-locked reserve inside submit, which is what catches two people racing for
// the last box.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { availableStock } from '@/lib/stock'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any
type Line = { item_id: string; description: string; quantity: string; unit_cost: string }

const EMPTY_LINE: Line = { item_id: '', description: '', quantity: '1', unit_cost: '' }

export default function NewRequisitionPage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()

  const [sites, setSites] = useState<Row[]>([])
  const [costCenters, setCostCenters] = useState<Row[]>([])
  const [items, setItems] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [justification, setJustification] = useState('')
  const [siteId, setSiteId] = useState('')
  const [costCenterId, setCostCenterId] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [lines, setLines] = useState<Line[]>([{ ...EMPTY_LINE }])

  const [tab, setTab] = useState<'purchase' | 'stock'>('purchase')
  // item_id -> quantity picked from the shelf.
  const [cart, setCart] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRefs() }, [])

  async function loadRefs() {
    const [sRes, cRes, iRes] = await Promise.all([
      supabase.from('sites').select('id, name').order('name'),
      supabase.from('cost_centers').select('id, name, code').order('name'),
      supabase.from('inventory_items')
        .select('id, name, name_ar, sku, unit, unit_cost, photo_url, stock_quantity, reserved_quantity')
        .order('name'),
    ])
    if (sRes.data) setSites(sRes.data)
    if (cRes.data) setCostCenters(cRes.data)
    if (iRes.data) setItems(iRes.data)
  }

  function setLine(idx: number, key: keyof Line, value: string) {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const next = { ...l, [key]: value }
      // Prefill cost + description from the picked item, like purchase-orders/new.
      if (key === 'item_id' && value) {
        const it = items.find(x => x.id === value)
        if (it) {
          if (!next.unit_cost && it.unit_cost != null) next.unit_cost = String(it.unit_cost)
          if (!next.description) next.description = it.name ?? ''
        }
      }
      return next
    }))
  }

  function setCartQty(item: Row, qty: number) {
    const capped = Math.max(0, Math.min(qty, availableStock(item)))
    setCart(prev => {
      const next = { ...prev }
      if (capped === 0) delete next[item.id]
      else next[item.id] = capped
      return next
    })
  }

  // The shortfall path: what the shelf cannot cover becomes something to buy.
  function addShortfallAsPurchase(item: Row, wanted: number) {
    const remaining = wanted - availableStock(item)
    if (remaining <= 0) return
    setLines(prev => {
      const blank = prev.findIndex(l => !l.item_id && !l.description.trim())
      const line: Line = {
        item_id: item.id,
        description: item.name ?? '',
        quantity: String(remaining),
        unit_cost: item.unit_cost != null ? String(item.unit_cost) : '',
      }
      return blank === -1 ? [...prev, line] : prev.map((l, i) => (i === blank ? line : l))
    })
    setTab('purchase')
  }

  const validLines = lines.filter(l => (l.item_id || l.description.trim()) && Number(l.quantity) > 0)
  const cartLines = Object.entries(cart)
    .map(([id, qty]) => ({ item: items.find(i => i.id === id), qty }))
    .filter(c => c.item && c.qty > 0)
  const purchaseTotal = validLines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0)
  const stockValue = cartLines.reduce((s, c) => s + c.qty * Number(c.item.unit_cost ?? 0), 0)

  const filteredItems = items.filter(i => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return [i.name, i.name_ar, i.sku].some(v => (v ?? '').toLowerCase().includes(q))
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError(isAr ? 'العنوان مطلوب.' : 'A title is required.'); return }
    if (validLines.length === 0 && cartLines.length === 0) {
      setError(isAr
        ? 'أضف بنداً واحداً على الأقل — للشراء أو من المخزون.'
        : 'Add at least one line — to buy, or from stock.')
      return
    }
    setSaving(true)
    const res = await fetch('/api/procurement/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        justification: justification || null,
        site_id: siteId || null,
        cost_center_id: costCenterId || null,
        needed_by: neededBy || null,
        lines: [
          ...validLines.map(l => ({
            item_id: l.item_id || null,
            description: l.description || null,
            quantity: Number(l.quantity),
            unit_cost: Number(l.unit_cost || 0),
            line_type: 'purchase',
          })),
          ...cartLines.map(c => ({
            item_id: c.item.id,
            description: c.item.name ?? null,
            quantity: c.qty,
            // Left out on purpose: the API values a stock line from the shelf.
            line_type: 'stock',
          })),
        ],
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || (isAr ? 'تعذّر إنشاء الطلب' : 'Failed to create the requisition'))
      return
    }
    const { requisition } = await res.json()
    router.push(`/dashboard/procurement/requisitions/${requisition.id}`)
  }

  const fieldCls = 'w-full bg-surface-container-low border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
  const labelCls = 'block text-xs font-semibold text-on-surface-variant mb-1.5'
  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
      active ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'
    }`

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/procurement/requisitions" className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">{isAr ? 'arrow_forward' : 'arrow_back'}</span>
          </Link>
          <h1 className="text-3xl font-bold text-on-surface">
            {isAr ? 'طلب شراء جديد' : 'New requisition'}
          </h1>
        </div>

        <form onSubmit={submit} className="space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-4">
            <div>
              <label className={labelCls}>{isAr ? 'العنوان' : 'Title'} *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className={fieldCls}
                placeholder={isAr ? 'مثال: قطع غيار مكيفات' : 'e.g. HVAC spare parts'} />
            </div>
            <div>
              <label className={labelCls}>{isAr ? 'المبرر' : 'Justification'}</label>
              <textarea value={justification} onChange={e => setJustification(e.target.value)} rows={3} className={fieldCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>{isAr ? 'الموقع' : 'Site'}</label>
                <select value={siteId} onChange={e => setSiteId(e.target.value)} className={fieldCls}>
                  <option value="">{isAr ? '— لا شيء —' : '— None —'}</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>{isAr ? 'مركز التكلفة' : 'Cost center'}</label>
                <select value={costCenterId} onChange={e => setCostCenterId(e.target.value)} className={fieldCls}>
                  <option value="">{isAr ? '— لا شيء —' : '— None —'}</option>
                  {costCenters.map(c => (
                    <option key={c.id} value={c.id}>{c.code ? `${c.code} · ${c.name}` : c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>{isAr ? 'مطلوب بحلول' : 'Needed by'}</label>
                <input type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} className={fieldCls} />
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm">
            <div className="flex items-center gap-2 px-6 border-b border-outline-variant/40">
              <button type="button" onClick={() => setTab('purchase')} className={tabCls(tab === 'purchase')}>
                {isAr ? 'أصناف للشراء' : 'Items needed'}
                {validLines.length > 0 && <span className="ms-2 text-xs text-on-surface-variant">{validLines.length}</span>}
              </button>
              <button type="button" onClick={() => setTab('stock')} className={tabCls(tab === 'stock')}>
                {isAr ? 'مستهلكات من المخزون' : 'Consumables in stock'}
                {cartLines.length > 0 && (
                  <span className="ms-2 text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">{cartLines.length}</span>
                )}
              </button>
            </div>

            {tab === 'purchase' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-on-surface-variant">
                    {isAr
                      ? 'هذه البنود تتحوّل إلى أمر شراء بعد الموافقة.'
                      : 'These lines become a purchase order once approved.'}
                  </p>
                  <button type="button" onClick={() => setLines(prev => [...prev, { ...EMPTY_LINE }])}
                    className="text-primary text-sm font-semibold hover:underline flex items-center gap-1">
                    <span className="material-symbols-outlined text-base">add</span>
                    {isAr ? 'إضافة بند' : 'Add line'}
                  </button>
                </div>

                {lines.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end border-b border-outline-variant/30 pb-4 last:border-0 last:pb-0">
                    <div className="sm:col-span-4">
                      <label className={labelCls}>{isAr ? 'الصنف' : 'Item'}</label>
                      <select value={l.item_id} onChange={e => setLine(idx, 'item_id', e.target.value)} className={fieldCls}>
                        <option value="">{isAr ? '— نص حر —' : '— Free text —'}</option>
                        {items.map(i => <option key={i.id} value={i.id}>{i.sku ? `${i.sku} · ${i.name}` : i.name}</option>)}
                      </select>
                    </div>
                    <div className="sm:col-span-4">
                      <label className={labelCls}>{isAr ? 'الوصف' : 'Description'}</label>
                      <input value={l.description} onChange={e => setLine(idx, 'description', e.target.value)} className={fieldCls} />
                    </div>
                    <div className="sm:col-span-1">
                      <label className={labelCls}>{isAr ? 'الكمية' : 'Qty'}</label>
                      <input type="number" min="0" step="any" value={l.quantity}
                        onChange={e => setLine(idx, 'quantity', e.target.value)} className={fieldCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{isAr ? 'سعر الوحدة' : 'Unit cost'}</label>
                      <input type="number" min="0" step="any" value={l.unit_cost}
                        onChange={e => setLine(idx, 'unit_cost', e.target.value)} className={fieldCls} />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button type="button" onClick={() => setLines(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx))}
                        disabled={lines.length === 1}
                        className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 disabled:opacity-30 transition-colors">
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end text-sm font-semibold text-on-surface pt-2">
                  {isAr ? 'إجمالي الشراء' : 'To buy'}:&nbsp;
                  {purchaseTotal.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                </div>
              </div>
            )}

            {tab === 'stock' && (
              <div className="p-6 space-y-4">
                <p className="text-xs text-on-surface-variant">
                  {isAr
                    ? 'تُصرف هذه الأصناف من المخزون عند الموافقة. المتاح = الرصيد ناقص ما حجزته طلبات أخرى.'
                    : 'These are issued from inventory on approval. Available = stock minus what other requisitions are holding.'}
                </p>

                <input value={search} onChange={e => setSearch(e.target.value)} className={fieldCls}
                  placeholder={isAr ? 'ابحث بالاسم أو الرمز…' : 'Search by name or SKU…'} />

                {filteredItems.length === 0 ? (
                  <p className="text-sm text-on-surface-variant py-6 text-center">
                    {isAr ? 'لا توجد أصناف مطابقة.' : 'No items match.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {filteredItems.map(i => {
                      const avail = availableStock(i)
                      const qty = cart[i.id] ?? 0
                      const out = avail === 0
                      return (
                        <div key={i.id}
                          className={`border rounded-xl overflow-hidden flex flex-col ${qty > 0 ? 'border-primary' : 'border-outline-variant'}`}>
                          <div className="aspect-[4/3] bg-surface-container-low flex items-center justify-center overflow-hidden">
                            {i.photo_url
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={i.photo_url} alt={i.name ?? ''} className="w-full h-full object-cover" />
                              : <span className="material-symbols-outlined text-3xl text-outline">inventory_2</span>}
                          </div>
                          <div className="p-3 flex-1 flex flex-col gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-on-surface truncate" title={i.name ?? ''}>
                                {isAr && i.name_ar ? i.name_ar : i.name}
                              </div>
                              {i.sku && <div className="text-[11px] text-on-surface-variant truncate">{i.sku}</div>}
                            </div>
                            <div className={`text-xs font-semibold ${out ? 'text-error' : 'text-on-surface-variant'}`}>
                              {out
                                ? (isAr ? 'غير متوفر' : 'None available')
                                : `${avail} ${i.unit ?? ''} ${isAr ? 'متاح' : 'available'}`}
                            </div>
                            {qty === 0 ? (
                              <button type="button" disabled={out} onClick={() => setCartQty(i, 1)}
                                className="mt-auto w-full border border-outline-variant rounded-lg py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 transition-colors">
                                {isAr ? 'إضافة' : 'Add'}
                              </button>
                            ) : (
                              <div className="mt-auto flex items-center justify-between gap-1">
                                <button type="button" onClick={() => setCartQty(i, qty - 1)}
                                  className="w-8 h-8 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-low">−</button>
                                <input type="number" min="0" max={avail} value={qty}
                                  onChange={e => setCartQty(i, Number(e.target.value))}
                                  className="w-full text-center bg-surface-container-low border border-outline-variant rounded-lg py-1 text-sm" />
                                <button type="button" disabled={qty >= avail} onClick={() => setCartQty(i, qty + 1)}
                                  className="w-8 h-8 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">+</button>
                              </div>
                            )}
                            {qty >= avail && avail > 0 && (
                              <button type="button" onClick={() => addShortfallAsPurchase(i, avail + 1)}
                                className="text-[11px] text-primary font-semibold hover:underline text-start">
                                {isAr ? 'تحتاج أكثر؟ أضفه كبند شراء' : 'Need more? Add it as a purchase line'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {cartLines.length > 0 && (
                  <div className="border border-outline-variant rounded-xl p-4 space-y-2">
                    <div className="text-sm font-semibold text-on-surface">{isAr ? 'المختار' : 'Picked'}</div>
                    {cartLines.map(c => (
                      <div key={c.item.id} className="flex items-center justify-between text-sm">
                        <span className="text-on-surface truncate">{isAr && c.item.name_ar ? c.item.name_ar : c.item.name}</span>
                        <span className="text-on-surface-variant whitespace-nowrap ms-3">
                          {c.qty} {c.item.unit ?? ''}
                          <button type="button" onClick={() => setCartQty(c.item, 0)}
                            className="text-on-surface-variant hover:text-error ms-2 align-middle">
                            <span className="material-symbols-outlined text-base">close</span>
                          </button>
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-end text-xs text-on-surface-variant pt-1 border-t border-outline-variant/40">
                      {isAr ? 'قيمة المخزون المصروف' : 'Value issued from stock'}:&nbsp;
                      {stockValue.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
              {saving ? '…' : (isAr ? 'حفظ كمسودة' : 'Save as draft')}
            </button>
            <Link href="/dashboard/procurement/requisitions"
              className="px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low transition-colors">
              {isAr ? 'إلغاء' : 'Cancel'}
            </Link>
          </div>
          <p className="text-xs text-on-surface-variant">
            {isAr
              ? 'يُحفظ الطلب كمسودة. يُحجز المخزون عند الإرسال للموافقة، لا قبل ذلك.'
              : 'Saved as a draft — stock is held when you send it for approval, not before.'}
          </p>
        </form>
      </div>
    </div>
  )
}
