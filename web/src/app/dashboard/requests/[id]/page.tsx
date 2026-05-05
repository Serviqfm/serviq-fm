'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { format } from 'date-fns'
import { C, F, pageStyle, primaryBtn, secondaryBtn, dangerBtn, inputStyle } from '@/lib/brand'

const PRIORITIES = ['low','medium','high','critical']

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

  if (loading) return <div style={pageStyle}><p style={{ color: C.textLight, fontFamily: F.en }}>Loading...</p></div>
  if (!request) return <div style={pageStyle}><p style={{ color: C.danger, fontFamily: F.en }}>Request not found.</p></div>

  const site = request.site as { name: string } | null
  const space = request.space as { name: string; floor: string } | null
  const wo = request.work_order as { wo_number: number; status: string; id: string } | null
  const woNum = wo?.wo_number ? `WO-${String(wo.wo_number).padStart(4, '0')}` : null

  return (
    <div style={{ ...pageStyle, maxWidth: 900 }}>
      <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 16px' }}>
        <Link href="/dashboard/requests" style={{ color: C.blue, textDecoration: 'none' }}>← Requests</Link>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        {/* Left */}
        <div>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: C.navy, margin: '0 0 4px', fontFamily: F.en }}>{request.title}</h1>
                <p style={{ fontSize: 13, color: C.textLight, margin: 0, fontFamily: F.en }}>
                  {request.category} · Submitted {format(new Date(request.created_at), 'dd MMM yyyy')}
                </p>
              </div>
              <span style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, flexShrink: 0,
                background: request.status === 'pending' ? '#FEF9C3' : request.status === 'approved' ? '#DCFCE7' : '#FEE2E2',
                color: request.status === 'pending' ? '#854D0E' : request.status === 'approved' ? '#166534' : '#991B1B',
                fontFamily: F.en,
              }}>
                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              {([
                ['Requester', request.requester_name],
                ['Email', request.requester_email],
                ['Phone', request.requester_phone || '—'],
                ['Site', site?.name || '—'],
                ['Space', space ? `${space.name} (${space.floor})` : '—'],
              ] as [string, string][]).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontFamily: F.en }}>{label}</div>
                  <div style={{ fontSize: 14, color: C.textDark, fontFamily: F.en }}>{val}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontFamily: F.en }}>Description</div>
              <p style={{ fontSize: 14, color: C.textMid, lineHeight: 1.7, margin: 0, fontFamily: F.en }}>{request.description}</p>
            </div>

            {request.rejection_reason && (
              <div style={{ marginTop: 16, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.danger, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, fontFamily: F.en }}>Rejection Reason</div>
                <p style={{ fontSize: 13, color: C.textDark, margin: 0, fontFamily: F.en }}>{request.rejection_reason}</p>
              </div>
            )}

            {woNum && wo && (
              <div style={{ marginTop: 16, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.success, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, fontFamily: F.en }}>Work Order Created</div>
                <Link href={`/dashboard/work-orders/${wo.id}`} style={{ fontSize: 14, fontWeight: 600, color: C.blue, fontFamily: F.en }}>{woNum} →</Link>
              </div>
            )}
          </div>

          {(request.photo_urls as string[])?.length > 0 && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: F.en }}>Photos</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(request.photo_urls as string[]).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Photo ${i+1}`} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: `1px solid ${C.border}` }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {(request.file_urls as string[])?.length > 0 && (
            <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: F.en }}>Files</div>
              {(request.file_urls as string[]).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: 'block', color: C.blue, fontFamily: F.en, fontSize: 13, marginBottom: 4 }}>
                  📎 Attachment {i + 1}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Right: actions */}
        {request.status === 'pending' && (
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14, fontFamily: F.en }}>Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setShowApprove(true)} style={{ ...primaryBtn, width: '100%' }}>
                Approve → Create Work Order
              </button>
              <button onClick={() => setShowReject(true)} style={{ ...dangerBtn, width: '100%' }}>
                Reject
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Approve modal */}
      {showApprove && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, margin: '0 0 6px', fontFamily: F.en }}>Approve Request</h3>
            <p style={{ fontSize: 13, color: C.textLight, margin: '0 0 20px', fontFamily: F.en }}>A work order will be created. Title, description, category, site and space are pre-filled.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} style={inputStyle}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Due Date (optional)</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
            {error && <p style={{ color: C.danger, fontSize: 13, margin: '12px 0 0', fontFamily: F.en }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleApprove} disabled={acting} style={{ ...primaryBtn, flex: 1 }}>{acting ? 'Creating...' : 'Confirm & Create WO'}</button>
              <button onClick={() => { setShowApprove(false); setError('') }} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showReject && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, padding: 28, maxWidth: 420, width: '100%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.navy, margin: '0 0 20px', fontFamily: F.en }}>Reject Request</h3>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 5, fontFamily: F.en }}>Reason (optional)</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Explain why this request is being rejected..." />
            </div>
            {error && <p style={{ color: C.danger, fontSize: 13, margin: '12px 0 0', fontFamily: F.en }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleReject} disabled={acting} style={{ ...dangerBtn, flex: 1 }}>{acting ? 'Rejecting...' : 'Reject Request'}</button>
              <button onClick={() => { setShowReject(false); setError('') }} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
