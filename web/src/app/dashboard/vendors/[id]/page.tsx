'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function VendorDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const [vendor, setVendor] = useState<any>(null)
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'details' | 'workorders' | 'invoices'>('details')
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({ invoice_number: '', amount: '', description: '', invoice_date: '', work_order_id: '' })
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [rating, setRating] = useState(0)
  const [savingRating, setSavingRating] = useState(false)

  useEffect(() => { fetchAll(); fetchVendorWOs() }, [id])

  async function fetchAll() {
    const [{ data: v }, { data: wos }, { data: inv }] = await Promise.all([
      supabase.from('vendors').select('*').eq('id', id).single(),
      supabase.from('work_orders').select('*, asset:asset_id(name), site:site_id(name)').eq('assigned_to', id).order('created_at', { ascending: false }),
      supabase.from('vendor_invoices').select('*').eq('vendor_id', id).order('created_at', { ascending: false }),
    ])
    if (v) { setVendor(v); setRating(v.average_rating ?? 0) }
    if (wos) setWorkOrders(wos)
    if (inv) setInvoices(inv)
    setLoading(false)
  }

  async function saveRating(newRating: number) {
    setSavingRating(true)
    await supabase.from('vendors').update({ average_rating: newRating }).eq('id', id)
    setRating(newRating)
    setSavingRating(false)
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!vendor) return <div style={{ padding: '2rem' }}>Vendor not found.</div>

  async function fetchVendorWOs() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('work_orders').select('id, title').eq('organisation_id', profile.organisation_id).eq('assigned_vendor_id', id as string).order('created_at', { ascending: false })
    if (data) setWorkOrders(data)
  }

  async function saveInvoice(e: React.FormEvent) {
    e.preventDefault()
    setSavingInvoice(true)
    const { error } = await supabase.from('vendor_invoices').insert({
      vendor_id: id,
      invoice_number: invoiceForm.invoice_number,
      amount: parseFloat(invoiceForm.amount),
      description: invoiceForm.description || null,
      invoice_date: invoiceForm.invoice_date || null,
      work_order_id: invoiceForm.work_order_id || null,
      status: 'pending',
    })
    if (!error) {
      setInvoiceForm({ invoice_number: '', amount: '', description: '', invoice_date: '', work_order_id: '' })
      setShowInvoiceForm(false)
      fetchAll()
    }
    setSavingInvoice(false)
  }

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px', border: 'none',
    borderBottom: active ? '2px solid #1a1a2e' : '2px solid transparent',
    background: 'transparent', cursor: 'pointer',
    fontSize: 13, fontWeight: (active ? 600 : 400) as any,
    color: active ? '#1a1a2e' : '#999',
  })

  const cardStyle = { background: '#f9f9f9', borderRadius: 8, padding: '12px 16px' }

  const totalInvoiced = invoices.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0)
  const totalPaid = invoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0)

  const woStatusConfig: Record<string, { bg: string; color: string }> = {
    new:         { bg: '#e3f2fd', color: '#0d47a1' },
    assigned:    { bg: '#e8eaf6', color: '#283593' },
    in_progress: { bg: '#fff8e1', color: '#f57f17' },
    on_hold:     { bg: '#fce4ec', color: '#880e4f' },
    completed:   { bg: '#e8f5e9', color: '#1b5e20' },
    closed:      { bg: '#f5f5f5', color: '#424242' },
  }

  const invStatusConfig: Record<string, { bg: string; color: string }> = {
    pending:  { bg: '#fff8e1', color: '#f57f17' },
    approved: { bg: '#e8eaf6', color: '#283593' },
    paid:     { bg: '#e8f5e9', color: '#1b5e20' },
    disputed: { bg: '#fce4ec', color: '#b71c1c' },
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 860, margin: '0 auto' }}>
      <a href='/dashboard/vendors' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Vendors</a>

      <div style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{vendor.company_name}</h1>
          {vendor.specialisation && <span style={{ background: '#e8eaf6', color: '#283593', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>{vendor.specialisation}</span>}
          <span style={{ background: vendor.is_active ? '#e8f5e9' : '#f5f5f5', color: vendor.is_active ? '#2e7d32' : '#666', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
            {vendor.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        {vendor.company_name_ar && <p style={{ color: '#999', fontSize: 14, marginTop: 4, direction: 'rtl', textAlign: 'left' }}>{vendor.company_name_ar}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
        <div style={cardStyle}>
          <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>Total Work Orders</p>
          <p style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{workOrders.length}</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>Total Invoiced</p>
          <p style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>SAR {totalInvoiced.toLocaleString()}</p>
        </div>
        <div style={cardStyle}>
          <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>Total Paid</p>
          <p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: '#2e7d32' }}>SAR {totalPaid.toLocaleString()}</p>
        </div>
      </div>

      <div style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px 16px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <p style={{ fontSize: 12, color: '#999', margin: '0 0 6px' }}>Performance Rating</p>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1,2,3,4,5].map(star => (
              <button key={star} onClick={() => saveRating(star)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: star <= rating ? '#f57f17' : '#ddd', padding: 0 }}>
                {star <= rating ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#999', margin: 0 }}>{savingRating ? 'Saving...' : rating > 0 ? rating + ' / 5' : 'Not yet rated  click a star to rate'}</p>
      </div>

      <div style={{ borderBottom: '1px solid #eee', marginBottom: '1rem', display: 'flex' }}>
        <button style={tabStyle(activeTab === 'details')} onClick={() => setActiveTab('details')}>Details</button>
        <button style={tabStyle(activeTab === 'workorders')} onClick={() => setActiveTab('workorders')}>Work Orders ({workOrders.length})</button>
        <button style={tabStyle(activeTab === 'invoices')} onClick={() => setActiveTab('invoices')}>Invoices ({invoices.length})</button>
      </div>

      {activeTab === 'details' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Contact Name', value: vendor.contact_name ?? '' },
            { label: 'Phone', value: vendor.phone ?? '' },
            { label: 'Email', value: vendor.email ?? '' },
            { label: 'Specialisation', value: vendor.specialisation ?? '' },
            { label: 'VAT Number', value: vendor.vat_number ?? '' },
            { label: 'CR Number', value: vendor.cr_number ?? '' },
          ].map(({ label, value }) => (
            <div key={label} style={cardStyle}>
              <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>{label}</p>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'workorders' && (
        <div>
          {workOrders.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No work orders assigned to this vendor yet.</p>
          ) : (
            <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                    {['Title','Asset','Status','Created'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workOrders.map((wo, i) => {
                    const cfg = woStatusConfig[wo.status] ?? woStatusConfig.new
                    return (
                      <tr key={wo.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <Link href={'/dashboard/work-orders/' + wo.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 13 }}>{wo.title}</Link>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#666' }}>{wo.asset?.name ?? ''}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 500 }}>
                            {wo.status.replace('_',' ').replace(/\w/g, (l: string) => l.toUpperCase())}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#666' }}>{format(new Date(wo.created_at), 'dd MMM yyyy')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'invoices' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
            <button onClick={() => setShowInvoiceForm(!showInvoiceForm)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              {showInvoiceForm ? 'Cancel' : '+ Add Invoice'}
            </button>
          </div>

          {showInvoiceForm && (
            <form onSubmit={saveInvoice} style={{ background: '#f9f9f9', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>New Invoice</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Invoice Number *</label>
                  <input value={invoiceForm.invoice_number} onChange={e => setInvoiceForm(p => ({ ...p, invoice_number: e.target.value }))} required placeholder='INV-2024-001' style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Amount (SAR) *</label>
                  <input type='number' value={invoiceForm.amount} onChange={e => setInvoiceForm(p => ({ ...p, amount: e.target.value }))} required placeholder='0.00' min='0' step='0.01' style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Invoice Date</label>
                  <input type='date' value={invoiceForm.invoice_date} onChange={e => setInvoiceForm(p => ({ ...p, invoice_date: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Linked Work Order</label>
                  <select value={invoiceForm.work_order_id} onChange={e => setInvoiceForm(p => ({ ...p, work_order_id: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, background: 'white', boxSizing: 'border-box' as const }}>
                    <option value=''>None</option>
                    {workOrders.map(wo => <option key={wo.id} value={wo.id}>{wo.title}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Description</label>
                <input value={invoiceForm.description} onChange={e => setInvoiceForm(p => ({ ...p, description: e.target.value }))} placeholder='e.g. HVAC service — 3 units' style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' as const }} />
              </div>
              <button type='submit' disabled={savingInvoice} style={{ padding: '9px', background: '#2e7d32', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: savingInvoice ? 0.7 : 1 }}>
                {savingInvoice ? 'Saving...' : 'Save Invoice'}
              </button>
            </form>
          )}

          {invoices.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No invoices yet. Click Add Invoice to record one.</p>
          ) : (
            <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                    {['Invoice No.','Amount','VAT','Date','Status'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv, i) => {
                    const cfg = invStatusConfig[inv.status] ?? invStatusConfig.pending
                    return (
                      <tr key={inv.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace' }}>{inv.invoice_number ?? ''}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500 }}>SAR {Number(inv.amount).toLocaleString()}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#666' }}>{inv.vat_amount ? 'SAR ' + Number(inv.vat_amount).toLocaleString() : ''}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#666' }}>{inv.invoice_date ? format(new Date(inv.invoice_date), 'dd MMM yyyy') : ''}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 500 }}>
                            {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}