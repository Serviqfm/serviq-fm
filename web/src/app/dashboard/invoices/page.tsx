'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'
import { C, F, pageStyle, cardStyle, tableHeaderCell, tableCell, inputStyle } from '@/lib/brand'
import { formatSAR } from '@/lib/zatca'

export default function InvoicesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const supabase                = createClient()
  const { lang }                = useLanguage()
  const isAr                    = lang === 'ar'

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchInvoices() }, [])

  async function fetchInvoices() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }

    const { data } = await supabase
      .from('invoices')
      .select('*, work_order:work_order_id(id, title, assignee:assigned_to(full_name), asset:asset_id(name))')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false })

    setInvoices(data ?? [])
    setLoading(false)
  }

  const filtered = invoices.filter(inv => {
    const title      = (inv.work_order?.title ?? '').toLowerCase()
    const technician = (inv.work_order?.assignee?.full_name ?? '').toLowerCase()
    const invNum     = (inv.invoice_number ?? '').toLowerCase()
    const q          = search.toLowerCase()
    return title.includes(q) || technician.includes(q) || invNum.includes(q)
  })

  async function downloadInvoice(inv: { id: string; invoice_number: string }) {
    const res = await fetch('/api/invoices/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: inv.id }),
    })
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${inv.invoice_number}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ ...pageStyle, fontFamily: isAr ? F.ar : F.en, direction: isAr ? 'rtl' : 'ltr' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.navy, margin: 0 }}>
          {isAr ? 'الفواتير' : 'Invoices'}
        </h1>
      </div>

      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={isAr ? 'بحث...' : 'Search by invoice number, work order or technician...'}
          style={{ ...inputStyle, maxWidth: 360 }}
        />
      </div>

      {loading ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
          <p style={{ color: C.textLight, fontFamily: F.en, margin: 0 }}>
            {isAr
              ? 'لا توجد فواتير. انتقل إلى أمر عمل مكتمل وانقر "إنشاء فاتورة".'
              : 'No invoices yet. Go to a completed work order and click "Generate Invoice".'}
          </p>
        </div>
      ) : (
        <div style={cardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={tableHeaderCell}>{isAr ? 'رقم الفاتورة' : 'Invoice #'}</th>
                <th style={tableHeaderCell}>{isAr ? 'أمر العمل' : 'Work Order'}</th>
                <th style={tableHeaderCell}>{isAr ? 'الفني' : 'Technician'}</th>
                <th style={tableHeaderCell}>{isAr ? 'الأصل' : 'Asset'}</th>
                <th style={tableHeaderCell}>{isAr ? 'المبلغ (بدون ضريبة)' : 'Subtotal'}</th>
                <th style={tableHeaderCell}>{isAr ? 'ضريبة القيمة المضافة' : 'VAT (15%)'}</th>
                <th style={tableHeaderCell}>{isAr ? 'الإجمالي' : 'Total'}</th>
                <th style={tableHeaderCell}>{isAr ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, i) => (
                <tr key={inv.id} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC' }}>
                  <td style={tableCell}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.navy, fontWeight: 600 }}>
                      {inv.invoice_number}
                    </span>
                  </td>
                  <td style={tableCell}>
                    <Link href={`/dashboard/work-orders/${inv.work_order?.id}`} style={{ color: C.blue, textDecoration: 'none', fontWeight: 500 }}>
                      {inv.work_order?.title ?? '—'}
                    </Link>
                  </td>
                  <td style={tableCell}>{inv.work_order?.assignee?.full_name ?? '—'}</td>
                  <td style={tableCell}>{inv.work_order?.asset?.name ?? '—'}</td>
                  <td style={tableCell}><span style={{ color: C.textMid }}>{formatSAR(inv.subtotal)}</span></td>
                  <td style={tableCell}><span style={{ color: C.textMid }}>{formatSAR(inv.vat_amount)}</span></td>
                  <td style={tableCell}><span style={{ fontWeight: 600, color: C.navy }}>{formatSAR(inv.total)}</span></td>
                  <td style={tableCell}>
                    <button
                      onClick={() => downloadInvoice(inv)}
                      style={{
                        background: 'none', border: `1px solid ${C.teal}`, color: C.teal,
                        borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
                        fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                      {isAr ? 'تحميل' : 'Download'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
