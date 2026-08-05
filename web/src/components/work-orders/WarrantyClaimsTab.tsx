'use client'

// FM-24 — Warranty claim tracking for a work order. Self-contained: fetches,
// creates and status-transitions rows in warranty_claims (SQL Files/w6-4-warranty-claims.sql).
// Degrades to an empty list when the table is absent (migration not yet applied).

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useLanguage } from '@/context/LanguageContext'

type Claim = {
  id: string
  claim_number: string | null
  status: 'submitted' | 'approved' | 'rejected' | 'paid'
  provider: string | null
  amount: number | null
  notes: string | null
  created_at: string
}

const STATUSES = ['submitted', 'approved', 'rejected', 'paid'] as const
type Status = (typeof STATUSES)[number]

// Allowed forward transitions. A claim can be approved/rejected once submitted,
// and an approved claim can be marked paid. Terminal states have no transitions.
const NEXT: Record<Status, Status[]> = {
  submitted: ['approved', 'rejected'],
  approved: ['paid', 'rejected'],
  rejected: [],
  paid: [],
}

const STATUS_LABEL: Record<Status, { en: string; ar: string }> = {
  submitted: { en: 'Submitted', ar: 'مُقدَّمة' },
  approved: { en: 'Approved', ar: 'موافق عليها' },
  rejected: { en: 'Rejected', ar: 'مرفوضة' },
  paid: { en: 'Paid', ar: 'مدفوعة' },
}

const STATUS_COLOR: Record<Status, string> = {
  submitted: '#6b7280',
  approved: '#2563eb',
  rejected: '#dc2626',
  paid: '#16a34a',
}

export default function WarrantyClaimsTab({
  woId,
  orgId,
  assetId,
  canManage,
}: {
  woId: string
  orgId: string
  assetId: string | null
  canManage: boolean
}) {
  const supabase = createClient()
  const { lang } = useLanguage()
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en)
  const [claims, setClaims] = useState<Claim[]>([])
  const [claimNumber, setClaimNumber] = useState('')
  const [provider, setProvider] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchClaims()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woId])

  async function fetchClaims() {
    // Table may not exist yet (migration not applied) — any error leaves the list empty.
    const { data } = await supabase
      .from('warranty_claims')
      .select('id, claim_number, status, provider, amount, notes, created_at')
      .eq('work_order_id', woId)
      .order('created_at', { ascending: false })
    if (data) setClaims(data as Claim[])
  }

  async function addClaim(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const amt = amount.trim() ? parseFloat(amount) : null
    const { error } = await supabase.from('warranty_claims').insert({
      organisation_id: orgId,
      work_order_id: woId,
      asset_id: assetId,
      claim_number: claimNumber.trim() || null,
      provider: provider.trim() || null,
      amount: amt !== null && !isNaN(amt) && amt >= 0 ? amt : null,
      notes: notes.trim() || null,
      created_by: user?.id ?? null,
    })
    setSaving(false)
    if (error) {
      alert(t('Failed to add claim: ', 'فشل إضافة المطالبة: ') + error.message)
      return
    }
    setClaimNumber('')
    setProvider('')
    setAmount('')
    setNotes('')
    fetchClaims()
  }

  async function setStatus(claim: Claim, status: Status) {
    // Optimistic; on error we re-fetch. Server-side, RLS gates writes to
    // admin/manager and a BEFORE UPDATE trigger enforces the legal transition
    // path (a raw-API jump straight to 'paid' is rejected).
    setClaims(prev => prev.map(c => (c.id === claim.id ? { ...c, status } : c)))
    const { error } = await supabase.from('warranty_claims').update({ status }).eq('id', claim.id)
    if (error) {
      alert(t('Failed to update status: ', 'فشل تحديث الحالة: ') + error.message)
      fetchClaims()
    }
  }

  return (
    <div>
      <p className="text-sm text-on-surface-variant mb-4">
        {t(
          'Track warranty claims raised against this work order and their status.',
          'تتبّع مطالبات الضمان المرفوعة على أمر العمل هذا وحالتها.'
        )}
      </p>

      {claims.length === 0 && (
        <p className="text-sm text-on-surface-variant mb-4">
          {t('No warranty claims yet.', 'لا توجد مطالبات ضمان بعد.')}
        </p>
      )}

      {claims.map(claim => {
        const st = claim.status as Status
        return (
          <div key={claim.id} className="bg-surface-container-low rounded-xl px-4 py-3 mb-2">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <span className="text-sm font-semibold text-on-surface">
                {claim.claim_number || t('Claim', 'مطالبة')}
              </span>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border"
                style={{ borderColor: STATUS_COLOR[st], color: STATUS_COLOR[st] }}
              >
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[st] }} />
                {t(STATUS_LABEL[st].en, STATUS_LABEL[st].ar)}
              </span>
              {claim.amount != null && (
                <span className="text-xs text-on-surface-variant">SAR {Number(claim.amount).toFixed(2)}</span>
              )}
            </div>
            <p className="text-xs text-on-surface-variant m-0">
              {claim.provider ? `${claim.provider} · ` : ''}
              {format(new Date(claim.created_at), 'dd MMM yyyy, HH:mm')}
            </p>
            {claim.notes && <p className="text-sm text-on-surface mt-1.5 m-0">{claim.notes}</p>}
            {canManage && NEXT[st].length > 0 && (
              <div className="flex gap-2 mt-2.5">
                {NEXT[st].map(next => (
                  <button
                    key={next}
                    onClick={() => setStatus(claim, next)}
                    className="border border-outline-variant text-on-surface-variant px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-surface-container-low transition-colors"
                  >
                    {t('Mark ', 'وضع كـ ')}
                    {t(STATUS_LABEL[next].en, STATUS_LABEL[next].ar)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {canManage && (
        <form onSubmit={addClaim} className="mt-4 bg-surface-container-low rounded-xl px-4 py-4 space-y-3">
          <p className="text-sm font-medium text-on-surface m-0">{t('New warranty claim', 'مطالبة ضمان جديدة')}</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={claimNumber}
              onChange={e => setClaimNumber(e.target.value)}
              placeholder={t('Claim number', 'رقم المطالبة')}
              className="bg-surface border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
            />
            <input
              value={provider}
              onChange={e => setProvider(e.target.value)}
              placeholder={t('Provider / vendor', 'المزوّد / المورّد')}
              className="bg-surface border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
            />
            <input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              placeholder={t('Amount (SAR)', 'المبلغ (ريال)')}
              className="bg-surface border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
            />
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder={t('Notes', 'ملاحظات')}
            className="w-full bg-surface border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={saving}
            className={`bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors ${saving ? 'opacity-50' : ''}`}
          >
            {saving ? '…' : t('Add claim', 'إضافة مطالبة')}
          </button>
        </form>
      )}
    </div>
  )
}
