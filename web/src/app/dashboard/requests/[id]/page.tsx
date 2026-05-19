'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { format } from 'date-fns'

const PRIORITIES = ['low','medium','high','critical']

function statusBadgeClass(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-[#f57f17]/10 text-[#f57f17] border border-[#f57f17]/20'
    case 'approved':
      return 'bg-primary/10 text-primary border border-primary/20'
    case 'rejected':
      return 'bg-error/10 text-error border border-error/20'
    default:
      return 'bg-surface-container-low text-on-surface-variant border border-outline-variant'
  }
}

export default function RequestDetailPage({ params }: { params: { id: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [request, setRequest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showApprove, setShowApprove] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [acting, setActing] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => { fetchRequest() }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRequest() {
    setLoading(true)
    const { data } = await supabase
      .from('requests')
      .select('*, site:site_id(name), space:space_id(name, floor), work_order:work_order_id(wo_number, status, id)')
      .eq('id', params.id)
      .single()
    if (data) setRequest(data)
    setLoading(false)
  }

  async function handleApprove() {
    setActing(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/requests/${params.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ priority, due_date: dueDate || null }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error); setActing(false); return }
    setShowApprove(false)
    fetchRequest()
    setActing(false)
  }

  async function handleReject() {
    setActing(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/requests/${params.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ reason: rejectReason }),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error); setActing(false); return }
    setShowReject(false)
    fetchRequest()
    setActing(false)
  }

  if (loading) return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <p className="text-on-surface-variant">Loading...</p>
    </div>
  )
  if (!request) return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <p className="text-error">Request not found.</p>
    </div>
  )

  const site = request.site as { name: string } | null
  const space = request.space as { name: string; floor: string } | null
  const wo = request.work_order as { wo_number: number; status: string; id: string } | null
  const woNum = wo?.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : null

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[900px] mx-auto space-y-6">
        {/* Back link */}
        <p className="text-sm">
          <Link href="/dashboard/requests" className="text-on-surface-variant text-sm hover:text-primary transition-colors">
            ← Requests
          </Link>
        </p>

        <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
          {/* Left column */}
          <div className="space-y-5">
            {/* Main info card */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
              <div className="flex justify-between items-start mb-5">
                <div>
                  <h1 className="text-xl font-bold text-on-surface mb-1">{request.title}</h1>
                  <p className="text-sm text-on-surface-variant">
                    {request.category} · Submitted {format(new Date(request.created_at), 'dd MMM yyyy')}
                  </p>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${statusBadgeClass(request.status)}`}>
                  {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3.5 mb-5">
                {([
                  ['Requester', request.requester_name],
                  ['Email', request.requester_email],
                  ['Phone', request.requester_phone || '—'],
                  ['Site', site?.name || '—'],
                  ['Space', space ? `${space.name} (${space.floor})` : '—'],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label}>
                    <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-0.5">{label}</div>
                    <div className="text-sm text-on-surface">{val}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5">Description</div>
                <p className="text-sm text-on-surface-variant leading-relaxed">{request.description}</p>
              </div>

              {request.rejection_reason && (
                <div className="mt-4 bg-error/10 border border-error/20 rounded-lg px-3.5 py-3">
                  <div className="text-[11px] font-semibold text-error uppercase tracking-wider mb-1">Rejection Reason</div>
                  <p className="text-sm text-on-surface">{request.rejection_reason}</p>
                </div>
              )}

              {woNum && wo && (
                <div className="mt-4 bg-primary/10 border border-primary/20 rounded-lg px-3.5 py-3">
                  <div className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-1">Work Order Created</div>
                  <Link href={`/dashboard/work-orders/${wo.id}`} className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
                    {woNum} →
                  </Link>
                </div>
              )}
            </div>

            {/* Photos */}
            {(request.photo_urls as string[])?.length > 0 && (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
                <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Photos</div>
                <div className="flex gap-2.5 flex-wrap">
                  {(request.photo_urls as string[]).map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Photo ${i+1}`} className="w-24 h-24 object-cover rounded-lg border border-outline-variant" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {(request.file_urls as string[])?.length > 0 && (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
                <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Files</div>
                {(request.file_urls as string[]).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="block text-primary text-sm mb-1 hover:text-primary/80 transition-colors">
                    📎 Attachment {i + 1}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Right: actions */}
          {request.status === 'pending' && (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5">
              <div className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-3.5">Actions</div>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => setShowApprove(true)}
                  className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 w-full"
                >
                  Approve → Create Work Order
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  className="bg-error/10 text-error border border-error/20 px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-error/20 transition-colors w-full"
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Approve modal */}
        {showApprove && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-6">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[16px] p-7 max-w-[420px] w-full shadow-xl">
              <h3 className="text-lg font-bold text-on-surface mb-1.5">Approve Request</h3>
              <p className="text-sm text-on-surface-variant mb-5">A work order will be created. Title, description, category, site and space are pre-filled.</p>
              <div className="flex flex-col gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Priority</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  >
                    {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Due Date (optional)</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  />
                </div>
              </div>
              {error && <p className="text-error text-sm mt-3">{error}</p>}
              <div className="flex gap-2.5 mt-5">
                <button
                  onClick={handleApprove}
                  disabled={acting}
                  className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 flex-1 disabled:opacity-60"
                >
                  {acting ? 'Creating...' : 'Confirm & Create WO'}
                </button>
                <button
                  onClick={() => { setShowApprove(false); setError('') }}
                  className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject modal */}
        {showReject && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-6">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[16px] p-7 max-w-[420px] w-full shadow-xl">
              <h3 className="text-lg font-bold text-on-surface mb-5">Reject Request</h3>
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Reason (optional)</label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Explain why this request is being rejected..."
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all min-h-[80px] resize-y"
                />
              </div>
              {error && <p className="text-error text-sm mt-3">{error}</p>}
              <div className="flex gap-2.5 mt-5">
                <button
                  onClick={handleReject}
                  disabled={acting}
                  className="bg-error/10 text-error border border-error/20 px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-error/20 transition-colors flex-1 disabled:opacity-60"
                >
                  {acting ? 'Rejecting...' : 'Reject Request'}
                </button>
                <button
                  onClick={() => { setShowReject(false); setError('') }}
                  className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
