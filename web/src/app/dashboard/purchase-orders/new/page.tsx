'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any
type Line = { item_id: string; quantity: string; unit_cost: string }

const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const { t } = useLanguage()
  const supabase = createClient()

  const [vendors, setVendors] = useState<Row[]>([])
  const [sites, setSites] = useState<Row[]>([])
  const [items, setItems] = useState<Row[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // FM-17: org-level module toggle (Settings → Purchasing). Permissive default.
  const [moduleEnabled, setModuleEnabled] = useState(true)

  const [vendorId, setVendorId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [status, setStatus] = useState<'draft' | 'sent'>('draft')
  const [expectedAt, setExpectedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ item_id: '', quantity: '1', unit_cost: '' }])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRefs() }, [])

  async function loadRefs() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (profile) {
      const { data: org } = await supabase
        .from('organisations').select('purchasing_enabled').eq('id', profile.organisation_id).single()
      if (org?.purchasing_enabled === false) { setModuleEnabled(false); return }
    }
    const [vRes, sRes, iRes] = await Promise.all([
      supabase.from('vendors').select('id, company_name').order('company_name'),
      supabase.from('sites').select('id, name').order('name'),
      supabase.from('inventory_items').select('id, name, sku, unit, unit_cost').order('name'),
    ])
    if (vRes.data) setVendors(vRes.data)
    if (sRes.data) setSites(sRes.data)
    if (iRes.data) setItems(iRes.data)
  }

  function setLine(idx: number, key: keyof Line, value: string) {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      const next = { ...l, [key]: value }
      // Prefill unit cost from the item's default when an item is picked.
      if (key === 'item_id' && !next.unit_cost) {
        const it = items.find(x => x.id === value)
        if (it?.unit_cost != null) next.unit_cost = String(it.unit_cost)
      }
      return next
    }))
  }

  function addLine() { setLines(prev => [...prev, { item_id: '', quantity: '1', unit_cost: '' }]) }
  function removeLine(idx: number) { setLines(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)) }

  const validLines = lines.filter(l => l.item_id && Number(l.quantity) > 0)
  const total = validLines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (validLines.length === 0) { setError('Add at least one line with an item and quantity.'); return }
    setSaving(true)
    const res = await fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendor_id: vendorId || null,
        site_id: siteId || null,
        status,
        expected_at: expectedAt || null,
        notes: notes || null,
        lines: validLines.map(l => ({ item_id: l.item_id, quantity: Number(l.quantity), unit_cost: Number(l.unit_cost || 0) })),
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'Failed to create purchase order')
      return
    }
    router.push('/dashboard/purchase-orders')
  }

  if (!moduleEnabled) return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-xl mx-auto text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
        <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">shopping_cart_off</span>
        <p className="text-lg font-semibold mb-1 text-on-surface">Purchase Orders is disabled</p>
        <p className="text-sm mb-4">An organisation admin turned this module off.</p>
        <Link href="/dashboard/settings/purchasing" className="text-primary text-sm font-semibold hover:underline">Purchasing Settings</Link>
      </div>
    </div>
  )

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/purchase-orders" className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <h1 className="text-2xl font-bold text-on-surface">New Purchase Order</h1>
        </div>

        <form onSubmit={submit} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 space-y-5">
          {error && <div className="bg-error/5 border border-error/20 text-error text-sm rounded-lg px-4 py-2">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Vendor</label>
              <select value={vendorId} onChange={e => setVendorId(e.target.value)} style={fieldStyle}>
                <option value="">— none —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.company_name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Deliver to site</label>
              <select value={siteId} onChange={e => setSiteId(e.target.value)} style={fieldStyle}>
                <option value="">— none —</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as 'draft' | 'sent')} style={fieldStyle}>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Expected date</label>
              <input type="date" value={expectedAt} onChange={e => setExpectedAt(e.target.value)} style={fieldStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span style={labelStyle}>Line items</span>
              <button type="button" onClick={addLine} className="text-sm text-primary font-semibold hover:underline">+ Add line</button>
            </div>
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <select value={l.item_id} onChange={e => setLine(idx, 'item_id', e.target.value)}
                    className="col-span-6" style={fieldStyle}>
                    <option value="">— select item —</option>
                    {items.map(it => <option key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ''}</option>)}
                  </select>
                  <input type="number" min="0" step="any" value={l.quantity} onChange={e => setLine(idx, 'quantity', e.target.value)}
                    placeholder="Qty" className="col-span-2" style={fieldStyle} />
                  <input type="number" min="0" step="any" value={l.unit_cost} onChange={e => setLine(idx, 'unit_cost', e.target.value)}
                    placeholder="Unit cost" className="col-span-3" style={fieldStyle} />
                  <button type="button" onClick={() => removeLine(idx)} disabled={lines.length === 1}
                    className="col-span-1 text-error disabled:opacity-30 flex justify-center">
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>
              ))}
            </div>
            <p className="text-right text-sm font-semibold text-on-surface mt-3">
              Total: SAR {total.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saving ? t('common.loading') : 'Create PO'}
            </button>
            <Link href="/dashboard/purchase-orders"
              className="px-6 py-2.5 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low transition-colors">
              {t('common.cancel')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
