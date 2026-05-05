'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { format } from 'date-fns'
import { C, F, pageStyle } from '@/lib/brand'

const STATUS_COLORS: Record<string, { background: string; color: string }> = {
  pending:  { background: '#FEF9C3', color: '#854D0E' },
  approved: { background: '#DCFCE7', color: '#166534' },
  rejected: { background: '#FEE2E2', color: '#991B1B' },
}

export default function RequestsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all'|'pending'|'approved'|'rejected'>('all')
  const supabase = createClient()

  useEffect(() => { fetchRequests() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchRequests() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data } = await supabase
      .from('requests')
      .select('*, site:site_id(name), space:space_id(name, floor), work_order:work_order_id(wo_number)')
      .eq('organisation_id', profile.organisation_id)
      .order('status')
      .order('created_at', { ascending: false })
    if (data) setRequests(data)
    setLoading(false)
  }

  const filtered = tab === 'all' ? requests : requests.filter(r => r.status === tab)
  const pendingCount = requests.filter(r => r.status === 'pending').length

  const thS: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: F.en, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
  const tdS: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: C.textMid, fontFamily: F.en, borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle' }

  return (
    <div style={{ ...pageStyle, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>Requests</h1>
            {pendingCount > 0 && (
              <span style={{ background: '#FEF9C3', color: '#854D0E', fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999, fontFamily: F.en }}>
                {pendingCount} pending
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>Occupant maintenance requests</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
        {(['all','pending','approved','rejected'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t ? 600 : 400,
            color: tab === t ? C.navy : C.textLight, fontFamily: F.en,
            borderBottom: tab === t ? `2px solid ${C.navy}` : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}{t === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.textLight, fontFamily: F.en }}>
          <p style={{ fontSize: 18 }}>No {tab === 'all' ? '' : tab} requests</p>
        </div>
      ) : (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Requester','Site','Space','Category','Submitted','Status',''].map(h => (
                  <th key={h} style={thS}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(req => (
                <tr key={req.id} style={{ background: req.status === 'pending' ? '#FFFBEB' : C.white }}>
                  <td style={tdS}>
                    <div style={{ fontWeight: 600, color: C.textDark }}>{req.requester_name}</div>
                    <div style={{ fontSize: 12, color: C.textLight }}>{req.requester_email}</div>
                    <div style={{ fontSize: 12, color: C.textMid, marginTop: 1 }}>{req.title}</div>
                  </td>
                  <td style={tdS}>{(req.site as { name: string } | null)?.name || '—'}</td>
                  <td style={tdS}>
                    {req.space ? `${(req.space as { name: string; floor: string }).name} (${(req.space as { name: string; floor: string }).floor})` : '—'}
                  </td>
                  <td style={tdS}>{req.category}</td>
                  <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{format(new Date(req.created_at), 'dd MMM yyyy')}</td>
                  <td style={tdS}>
                    <span style={{ ...STATUS_COLORS[req.status], padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                      {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </span>
                    {(req.work_order as { wo_number: number } | null)?.wo_number && (
                      <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>
                        WO-{String((req.work_order as { wo_number: number }).wo_number).padStart(4, '0')}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                    <Link href={`/dashboard/requests/${req.id}`} style={{ color: C.blue, fontWeight: 600, textDecoration: 'none', fontSize: 12 }}>
                      Review →
                    </Link>
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
