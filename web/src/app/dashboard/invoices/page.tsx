'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'
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
    <div
      className="star-pattern bg-surface min-h-screen p-8"
      style={{ fontFamily: isAr ? 'Cairo, sans-serif' : 'Inter, sans-serif', direction: isAr ? 'rtl' : 'ltr' }}
    >
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-on-surface m-0">
            {isAr ? 'الفواتير' : 'Invoices'}
          </h1>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث...' : 'Search by invoice number, work order or technician...'}
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all max-w-[360px]"
          />
        </div>

        {loading ? (
          <p className="text-on-surface-variant text-sm">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm text-center p-10">
            <p className="text-on-surface-variant text-sm m-0">
              {isAr
                ? 'لا توجد فواتير. انتقل إلى أمر عمل مكتمل وانقر "إنشاء فاتورة".'
                : 'No invoices yet. Go to a completed work order and click "Generate Invoice".'}
            </p>
          </div>
        ) : (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/30">
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap text-left">{isAr ? 'رقم الفاتورة' : 'Invoice #'}</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap text-left">{isAr ? 'أمر العمل' : 'Work Order'}</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap text-left">{isAr ? 'الفني' : 'Technician'}</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap text-left">{isAr ? 'الأصل' : 'Asset'}</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap text-left">{isAr ? 'المبلغ (بدون ضريبة)' : 'Subtotal'}</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap text-left">{isAr ? 'ضريبة القيمة المضافة' : 'VAT (15%)'}</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap text-left">{isAr ? 'الإجمالي' : 'Total'}</th>
                  <th className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap text-left">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-sm text-on-surface">
                      <span className="font-mono text-xs text-on-surface font-semibold">
                        {inv.invoice_number}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface">
                      <Link href={`/dashboard/work-orders/${inv.work_order?.id}`} className="text-secondary font-medium hover:underline">
                        {inv.work_order?.title ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{inv.work_order?.assignee?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{inv.work_order?.asset?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{formatSAR(inv.subtotal)}</td>
                    <td className="px-4 py-3 text-sm text-on-surface-variant">{formatSAR(inv.vat_amount)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-on-surface">{formatSAR(inv.total)}</td>
                    <td className="px-4 py-3 text-sm text-on-surface">
                      <button
                        onClick={() => downloadInvoice(inv)}
                        className="flex items-center gap-1 border border-secondary text-secondary rounded-md px-3 py-1 text-xs font-semibold hover:bg-secondary/10 transition-colors cursor-pointer bg-transparent"
                      >
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
    </div>
  )
}
