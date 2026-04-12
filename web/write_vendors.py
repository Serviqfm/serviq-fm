vendors_list = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const supabase = createClient()

  useEffect(() => { fetchVendors() }, [])

  async function fetchVendors() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('vendors').select('*').eq('organisation_id', profile.organisation_id).order('company_name', { ascending: true })
    if (data) setVendors(data)
    setLoading(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('vendors').update({ is_active: !current }).eq('id', id)
    fetchVendors()
  }

  const filtered = vendors.filter(v =>
    v.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.specialisation?.toLowerCase().includes(search.toLowerCase())
  )

  const stars = (rating: number) => {
    if (!rating) return ''
    return Array.from({ length: 5 }, (_, i) => i < Math.round(rating) ? '' : '').join('')
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Vendors</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{vendors.length} vendors registered</p>
        </div>
        <Link href='/dashboard/vendors/new'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
            + Add Vendor
          </button>
        </Link>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder='Search by company name, contact, or specialisation...'
        style={{ width: '100%', padding: '9px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: '1.5rem', boxSizing: 'border-box' }}
      />

      {loading ? (
        <p style={{ color: '#999' }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No vendors yet</p>
          <p style={{ fontSize: 14 }}>Add your first vendor to assign them to work orders</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                {['Company','Contact','Phone','Specialisation','Rating','VAT No.','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={'/dashboard/vendors/' + v.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>{v.company_name}</Link>
                    {v.company_name_ar && <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0', direction: 'rtl' }}>{v.company_name_ar}</p>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{v.contact_name ?? ''}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{v.phone ?? ''}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{v.specialisation ?? ''}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#f57f17' }}>{stars(v.average_rating)}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666', fontFamily: 'monospace' }}>{v.vat_number ?? ''}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: v.is_active ? '#e8f5e9' : '#f5f5f5', color: v.is_active ? '#2e7d32' : '#666', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                      {v.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Link href={'/dashboard/vendors/' + v.id}>
                        <button style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 12 }}>View</button>
                      </Link>
                      <button onClick={() => toggleActive(v.id, v.is_active)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 12, color: '#666' }}>
                        {v.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}"""

vendors_new = """'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function NewVendorPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    company_name: '',
    company_name_ar: '',
    contact_name: '',
    phone: '',
    email: '',
    specialisation: '',
    vat_number: '',
    cr_number: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in'); setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setError('User profile not found'); setLoading(false); return }
    const { error: insertError } = await supabase.from('vendors').insert({
      company_name: form.company_name,
      company_name_ar: form.company_name_ar || null,
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      email: form.email || null,
      specialisation: form.specialisation || null,
      vat_number: form.vat_number || null,
      cr_number: form.cr_number || null,
      organisation_id: profile.organisation_id,
      is_active: true,
    })
    if (insertError) { setError(insertError.message); setLoading(false) }
    else router.push('/dashboard/vendors')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  return (
    <div style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/vendors' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Vendors</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Add New Vendor</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Company Name (English) *</label>
          <input name='company_name' value={form.company_name} onChange={handleChange} required placeholder='e.g. Al Faris Technical Services' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Company Name (Arabic)</label>
          <input name='company_name_ar' value={form.company_name_ar} onChange={handleChange} placeholder='اسم الشركة بالعربية' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Contact Name</label>
            <input name='contact_name' value={form.contact_name} onChange={handleChange} placeholder='e.g. Ahmed Al-Rashid' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input name='phone' value={form.phone} onChange={handleChange} placeholder='e.g. +966 50 000 0000' style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input name='email' type='email' value={form.email} onChange={handleChange} placeholder='e.g. info@vendor.com' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Specialisation</label>
          <select name='specialisation' value={form.specialisation} onChange={handleChange} style={fieldStyle}>
            <option value=''>Select specialisation</option>
            <option value='HVAC'>HVAC</option>
            <option value='Electrical'>Electrical</option>
            <option value='Plumbing'>Plumbing</option>
            <option value='Elevator / Lift'>Elevator / Lift</option>
            <option value='Fire Safety'>Fire Safety</option>
            <option value='Civil / Construction'>Civil / Construction</option>
            <option value='Cleaning'>Cleaning</option>
            <option value='Landscaping'>Landscaping</option>
            <option value='IT / AV'>IT / AV</option>
            <option value='Security'>Security</option>
            <option value='General Maintenance'>General Maintenance</option>
            <option value='Other'>Other</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>VAT Number</label>
            <input name='vat_number' value={form.vat_number} onChange={handleChange} placeholder='e.g. 300000000000003' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>CR Number</label>
            <input name='cr_number' value={form.cr_number} onChange={handleChange} placeholder='e.g. 1010000000' style={fieldStyle} />
          </div>
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Save Vendor'}
        </button>
      </form>
    </div>
  )
}"""

vendors_detail = """'use client'

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
  const [rating, setRating] = useState(0)
  const [savingRating, setSavingRating] = useState(false)

  useEffect(() => { fetchAll() }, [id])

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
                            {wo.status.replace('_',' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
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
          {invoices.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No invoices recorded for this vendor yet.</p>
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
}"""

import os
os.makedirs('src/app/dashboard/vendors', exist_ok=True)
os.makedirs('src/app/dashboard/vendors/new', exist_ok=True)
os.makedirs('src/app/dashboard/vendors/[id]', exist_ok=True)

with open('src/app/dashboard/vendors/page.tsx', 'w', encoding='utf-8') as f:
    f.write(vendors_list)
print('vendors/page.tsx written')

with open('src/app/dashboard/vendors/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(vendors_new)
print('vendors/new/page.tsx written')

with open('src/app/dashboard/vendors/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(vendors_detail)
print('vendors/[id]/page.tsx written')
