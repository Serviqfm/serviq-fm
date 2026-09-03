// web/src/app/dashboard/procurement/requisitions/new/page.tsx
// P1: raise a requisition. Line-item form mirroring purchase-orders/new, with a
// free-text description fallback so you can request something that isn't an
// inventory item yet.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRefs() }, [])

  async function loadRefs() {
    const [sRes, cRes, iRes] = await Promise.all([
      supabase.from('sites').select('id, name').order('name'),
      supabase.from('cost_centers').select('id, name, code').order('name'),
      supabase.from('inventory_items').select('id, name, sku, unit_cost').order('name'),
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

  const validLines = lines.filter(l => (l.item_id || l.description.trim()) && Number(l.quantity) > 0)
  const total = validLines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError(isAr ? 'العنوان مطلوب.' : 'A title is required.'); return }
    if (validLines.length === 0) {
      setError(isAr ? 'أضف بنداً واحداً على الأقل بكمية صحيحة.' : 'Add at least one line with a quantity.')
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
        lines: validLines.map(l => ({
          item_id: l.item_id || null,
          description: l.description || null,
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost || 0),
        })),
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

          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-on-surface">{isAr ? 'البنود' : 'Line items'}</h2>
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
              {isAr ? 'الإجمالي' : 'Total'}:&nbsp;
              {total.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
            </div>
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
              ? 'يُحفظ الطلب كمسودة. أرسله للموافقة من صفحة التفاصيل.'
              : 'Saved as a draft — send it for approval from the detail page.'}
          </p>
        </form>
      </div>
    </div>
  )
}
