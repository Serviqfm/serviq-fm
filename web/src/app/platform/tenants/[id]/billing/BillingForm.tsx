'use client'

import { useEffect, useState } from 'react'
import { formatSAR, parseSARToCents } from '@/lib/currency'

type BillingData = {
  plan: string
  billing_status: string
  mrr_cents: number
  renews_at: string | null
  contract_notes: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export default function BillingForm({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<BillingData | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/platform/tenants/${tenantId}/billing`)
      .then(r => r.json())
      .then(d => setData(d.billing))
  }, [tenantId])

  if (!data) return <div className="text-on-surface-variant">Loading…</div>

  async function save() {
    if (!data) return
    setSaving(true)
    setError('')
    const res = await fetch(`/api/platform/tenants/${tenantId}/billing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: 'Unknown error' }))
      setError(j.error ?? 'Save failed')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-6 max-w-3xl">
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 space-y-4">
      <h3 className="text-base font-bold text-on-surface">Subscription & Plan</h3>
      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Plan</label>
        <select
          value={data.plan}
          onChange={e => setData(d => d && { ...d, plan: e.target.value })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        >
          {['free', 'starter', 'pro', 'enterprise'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Billing status</label>
        <select
          value={data.billing_status}
          onChange={e => setData(d => d && { ...d, billing_status: e.target.value })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        >
          {['paid', 'failed', 'overdue'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">MRR (SAR)</label>
        <input
          type="text"
          value={(data.mrr_cents / 100).toFixed(2)}
          onChange={e => setData(d => d && { ...d, mrr_cents: parseSARToCents(e.target.value) })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        />
        <div className="text-[11px] text-on-surface-variant mt-1">
          Stored: {data.mrr_cents} cents · Display: {formatSAR(data.mrr_cents)}
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Renews on</label>
        <input
          type="date"
          value={data.renews_at ?? ''}
          onChange={e => setData(d => d && { ...d, renews_at: e.target.value || null })}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Contract notes</label>
        <textarea
          value={data.contract_notes ?? ''}
          onChange={e => setData(d => d && { ...d, contract_notes: e.target.value || null })}
          rows={4}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm"
        />
      </div>

      <div className="border-t border-outline-variant pt-4 space-y-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-secondary">Stripe Integration</div>
        <p className="text-[11px] text-on-surface-variant">
          Paste the Customer ID (cus_…) and Subscription ID (sub_…) from your Stripe dashboard.
          These are stored on the tenant for reference; full Stripe sync is not yet wired.
        </p>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Stripe Customer ID</label>
          <input
            type="text"
            placeholder="cus_…"
            value={data.stripe_customer_id ?? ''}
            onChange={e => setData(d => d && { ...d, stripe_customer_id: e.target.value || null })}
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Stripe Subscription ID</label>
          <input
            type="text"
            placeholder="sub_…"
            value={data.stripe_subscription_id ?? ''}
            onChange={e => setData(d => d && { ...d, stripe_subscription_id: e.target.value || null })}
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm font-mono"
          />
        </div>
      </div>

      {error && (
        <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm">{error}</div>
      )}

      <div className="flex gap-3 items-center">
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-primary text-sm font-semibold">Saved</span>}
      </div>
    </div>

    <InvoicesSection tenantId={tenantId} />
    </div>
  )
}

type LineItem = { description: string; qty: number; unit_price_cents: number }
type Invoice = {
  id: string
  invoice_number: string
  issue_date: string
  due_date: string | null
  subtotal_cents: number
  vat_cents: number
  total_cents: number
  status: string
}

function InvoicesSection({ tenantId }: { tenantId: string }) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [items, setItems] = useState<LineItem[]>([
    { description: 'Subscription — Monthly', qty: 1, unit_price_cents: 0 },
  ])
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { reload() }, [tenantId]) // eslint-disable-line react-hooks/exhaustive-deps

  function reload() {
    fetch(`/api/platform/tenants/${tenantId}/invoices`).then(r => r.json()).then(d => setInvoices(d.invoices ?? []))
  }

  function updateItem(i: number, patch: Partial<LineItem>) {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }
  function addItem() {
    setItems(prev => [...prev, { description: '', qty: 1, unit_price_cents: 0 }])
  }
  function removeItem(i: number) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  const subtotal = items.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unit_price_cents) || 0), 0)
  const vat = Math.round(subtotal * 0.15)
  const total = subtotal + vat

  async function create() {
    setSaving(true); setError('')
    const res = await fetch(`/api/platform/tenants/${tenantId}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line_items: items, due_date: dueDate || null, notes: notes || null }),
    })
    setSaving(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: 'Unknown error' }))
      setError(j.error ?? 'Create failed')
      return
    }
    setItems([{ description: 'Subscription — Monthly', qty: 1, unit_price_cents: 0 }])
    setDueDate(''); setNotes(''); setShowForm(false)
    reload()
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-on-surface">Invoices & Fees</h3>
        <button onClick={() => setShowForm(s => !s)}
          className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors">
          {showForm ? 'Cancel' : '+ Generate Invoice'}
        </button>
      </div>

      {showForm && (
        <div className="bg-surface-container-low border border-outline-variant/40 rounded-xl p-4 space-y-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-secondary">Line items (add subscription, ad-hoc fees, or other bills)</div>
          {items.map((li, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6">
                <label className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Description</label>
                <input value={li.description} onChange={e => updateItem(i, { description: e.target.value })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Qty</label>
                <input type="number" min="1" value={li.qty} onChange={e => updateItem(i, { qty: Number(e.target.value) })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-3">
                <label className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Unit price (SAR)</label>
                <input type="number" min="0" step="0.01" value={(li.unit_price_cents / 100).toFixed(2)}
                  onChange={e => updateItem(i, { unit_price_cents: Math.round(Number(e.target.value) * 100) })}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="col-span-1 text-right">
                {items.length > 1 && (
                  <button onClick={() => removeItem(i)} title="Remove" className="text-error hover:bg-error/10 rounded-lg p-1.5">
                    <span className="material-symbols-outlined text-base">delete</span>
                  </button>
                )}
              </div>
            </div>
          ))}
          <button onClick={addItem} className="text-sm text-primary font-semibold hover:underline">+ Add line item</button>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-outline-variant/40">
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Due date (optional)</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant">Notes (optional)</label>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-outline-variant/40 text-sm">
            <div className="space-y-0.5 text-on-surface-variant">
              <div>Subtotal: <span className="text-on-surface font-semibold">{formatSAR(subtotal)}</span></div>
              <div>VAT (15%): <span className="text-on-surface font-semibold">{formatSAR(vat)}</span></div>
              <div className="text-primary font-bold">Total: {formatSAR(total)}</div>
            </div>
            <button onClick={create} disabled={saving || items.length === 0 || subtotal === 0}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
              {saving ? 'Creating…' : 'Create invoice'}
            </button>
          </div>
          {error && <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm">{error}</div>}
        </div>
      )}

      {invoices === null ? (
        <div className="text-on-surface-variant text-sm">Loading invoices…</div>
      ) : invoices.length === 0 ? (
        <div className="text-on-surface-variant text-sm py-6 text-center">No invoices issued yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-secondary">Invoice #</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-secondary">Issued</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-secondary">Due</th>
                <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-secondary">Total</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-secondary">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {invoices.map(inv => (
                <InvoiceRow key={inv.id} inv={inv} tenantId={tenantId} onChange={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-surface-container-high text-on-surface-variant',
  sent:  'bg-secondary/10 text-secondary',
  paid:  'bg-primary/10 text-primary',
  void:  'bg-error/10 text-error',
}

function InvoiceRow({ inv, tenantId, onChange }: { inv: Invoice; tenantId: string; onChange: () => void }) {
  const [busy, setBusy] = useState<'' | 'send' | 'paid' | 'void'>('')
  const [error, setError] = useState('')

  function downloadPdf() {
    window.open(`/api/platform/tenants/${tenantId}/invoices/${inv.id}/pdf`, '_blank')
  }

  async function patch(payload: Record<string, unknown>, kind: 'send' | 'paid' | 'void') {
    setBusy(kind); setError('')
    const res = await fetch(`/api/platform/tenants/${tenantId}/invoices/${inv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setBusy('')
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: 'Unknown error' }))
      setError(j.error ?? 'Action failed')
      setTimeout(() => setError(''), 5000)
      return
    }
    onChange()
  }

  return (
    <>
      <tr>
        <td className="px-3 py-2 font-semibold">{inv.invoice_number}</td>
        <td className="px-3 py-2 text-on-surface-variant">{new Date(inv.issue_date).toLocaleDateString('en-GB')}</td>
        <td className="px-3 py-2 text-on-surface-variant">{inv.due_date ? new Date(inv.due_date).toLocaleDateString('en-GB') : '—'}</td>
        <td className="px-3 py-2 text-right font-semibold">{formatSAR(inv.total_cents)}</td>
        <td className="px-3 py-2">
          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft}`}>{inv.status}</span>
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-2 text-xs font-semibold">
            <button onClick={downloadPdf} className="text-primary hover:underline">PDF</button>
            {inv.status !== 'paid' && inv.status !== 'void' && (
              <button onClick={() => patch({ send_email: true, status: 'sent' }, 'send')} disabled={busy === 'send'} className="text-secondary hover:underline disabled:opacity-50">
                {busy === 'send' ? 'Sending…' : 'Send'}
              </button>
            )}
            {inv.status !== 'paid' && inv.status !== 'void' && (
              <button onClick={() => patch({ status: 'paid' }, 'paid')} disabled={busy === 'paid'} className="text-primary hover:underline disabled:opacity-50">
                {busy === 'paid' ? '…' : 'Mark Paid'}
              </button>
            )}
            {inv.status !== 'void' && (
              <button onClick={() => { if (confirm('Void invoice ' + inv.invoice_number + '?')) patch({ status: 'void' }, 'void') }} disabled={busy === 'void'} className="text-error hover:underline disabled:opacity-50">
                {busy === 'void' ? '…' : 'Void'}
              </button>
            )}
          </div>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} className="px-3 pb-2">
            <div className="bg-error/10 border border-error/20 text-error rounded-lg px-3 py-1.5 text-xs">{error}</div>
          </td>
        </tr>
      )}
    </>
  )
}
