'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useParams, useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

const STATUS_CFG: Record<string, { bg: string; color: string; en: string; ar: string }> = {
  requested: { bg: '#fff8e1', color: '#f57f17', en: 'Requested', ar: 'مطلوب' },
  approved:  { bg: '#e3f2fd', color: '#1565c0', en: 'Approved',  ar: 'معتمد' },
  scheduled: { bg: '#ede7f6', color: '#5e35b1', en: 'Scheduled', ar: 'مجدول' },
  completed: { bg: '#e8f5e9', color: '#2e7d32', en: 'Completed', ar: 'مكتمل' },
  rejected:  { bg: '#fce4ec', color: '#b71c1c', en: 'Rejected',  ar: 'مرفوض' },
}

export default function MoveDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const { lang } = useLanguage()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [move, setMove] = useState<any>(null)
  const [role, setRole] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMove() }, [id])

  async function fetchMove() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserId(user.id)
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (profile) setRole(profile.role)
    }
    const { data } = await supabase.from('space_moves')
      .select('*, from_space:from_space_id(id, name), to_space:to_space_id(id, name, site_id), asset:asset_id(id, name), requester:requested_by(full_name), approver:approved_by(full_name)')
      .eq('id', id).single()
    if (data) setMove(data)
    setLoading(false)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function transition(patch: Record<string, any>) {
    setBusy(true)
    const { error } = await supabase.from('space_moves').update(patch).eq('id', id)
    if (error) { alert(error.message); setBusy(false); return }
    await fetchMove()
    setBusy(false)
  }

  // On completion, repoint the asset to the destination space/site (org-scoped UPDATE).
  async function complete() {
    setBusy(true)
    // Just mark completed — the DB trigger (apply_space_move_on_complete) repoints
    // the asset in the SAME transaction, so the move can't complete without the
    // asset actually moving (no more non-atomic two-step).
    const { error } = await supabase.from('space_moves')
      .update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert(error.message); setBusy(false); return }
    await fetchMove()
    setBusy(false)
  }

  async function del() {
    if (!confirm(lang === 'ar' ? 'حذف طلب النقل هذا؟' : 'Delete this move request?')) return
    setBusy(true)
    const { error } = await supabase.from('space_moves').delete().eq('id', id)
    if (error) { alert(error.message); setBusy(false); return }
    router.push('/dashboard/moves')
  }

  if (loading) return <div style={{ padding: '2rem' }}>{lang === 'ar' ? 'جار التحميل...' : 'Loading...'}</div>
  if (!move) return <div style={{ padding: '2rem' }}>{lang === 'ar' ? 'طلب النقل غير موجود' : 'Move not found.'}</div>

  const isManager = role === 'admin' || role === 'manager'
  const s = STATUS_CFG[move.status] ?? STATUS_CFG.requested
  const btn = (bg: string) => ({ padding: '9px 18px', borderRadius: 8, border: 'none', background: bg, color: 'white', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, opacity: busy ? 0.6 : 1 })

  // Lifecycle actions for the current status (all writes are admin/manager via RLS).
  const actions: React.ReactNode[] = []
  if (move.status === 'requested' && isManager) {
    actions.push(<button key='app' disabled={busy} onClick={() => transition({ status: 'approved', approved_by: userId })} style={btn('#1565c0')}>{lang === 'ar' ? 'اعتماد' : 'Approve'}</button>)
    actions.push(<button key='rej' disabled={busy} onClick={() => transition({ status: 'rejected' })} style={btn('#b71c1c')}>{lang === 'ar' ? 'رفض' : 'Reject'}</button>)
  }
  if (move.status === 'approved' && isManager) {
    actions.push(<button key='sch' disabled={busy} onClick={() => transition({ status: 'scheduled' })} style={btn('#5e35b1')}>{lang === 'ar' ? 'جدولة' : 'Schedule'}</button>)
    actions.push(<button key='rej' disabled={busy} onClick={() => transition({ status: 'rejected' })} style={btn('#b71c1c')}>{lang === 'ar' ? 'رفض' : 'Reject'}</button>)
  }
  if (move.status === 'scheduled' && isManager) {
    actions.push(<button key='cmp' disabled={busy} onClick={complete} style={btn('#2e7d32')}>{lang === 'ar' ? 'إكمال' : 'Complete'}</button>)
    actions.push(<button key='rej' disabled={busy} onClick={() => transition({ status: 'rejected' })} style={btn('#b71c1c')}>{lang === 'ar' ? 'رفض' : 'Reject'}</button>)
  }

  const subjectTypeLabel = move.subject_type === 'asset' ? (lang === 'ar' ? 'أصل' : 'Asset') : (lang === 'ar' ? 'شاغل' : 'Occupant')

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
      <span style={{ fontSize: 13, color: '#999', width: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: '#333' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ padding: '2rem', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <a href='/dashboard/moves' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع للنقل' : 'Back to Moves'}</a>
        {isManager && (
          <button disabled={busy} onClick={del} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#b71c1c', cursor: 'pointer', fontSize: 13 }}>{lang === 'ar' ? 'حذف' : 'Delete'}</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{move.subject_label || subjectTypeLabel}</h1>
        <span style={{ background: s.bg, color: s.color, padding: '3px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>{lang === 'ar' ? s.ar : s.en}</span>
      </div>

      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: '1.5rem', flexWrap: 'wrap' }}>{actions}</div>
      )}

      <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 10, padding: '0 1.25rem' }}>
        {row(lang === 'ar' ? 'النوع' : 'Type', subjectTypeLabel)}
        {move.subject_type === 'asset' && row(lang === 'ar' ? 'الأصل' : 'Asset', move.asset
          ? <a href={'/dashboard/assets/' + move.asset.id} style={{ color: '#1565c0', textDecoration: 'none' }}>{move.asset.name}</a>
          : '—')}
        {row(lang === 'ar' ? 'من مكان' : 'From Space', move.from_space?.name ?? '—')}
        {row(lang === 'ar' ? 'إلى مكان' : 'To Space', move.to_space?.name ?? '—')}
        {row(lang === 'ar' ? 'موعد مقترح' : 'Scheduled For', move.scheduled_for ? format(new Date(move.scheduled_for), 'dd MMM yyyy, HH:mm') : '—')}
        {row(lang === 'ar' ? 'ملاحظات' : 'Notes', <span style={{ whiteSpace: 'pre-wrap' }}>{move.notes || '—'}</span>)}
        {row(lang === 'ar' ? 'مقدم الطلب' : 'Requested By', move.requester?.full_name ?? '—')}
        {row(lang === 'ar' ? 'المعتمد' : 'Approved By', move.approver?.full_name ?? '—')}
        {row(lang === 'ar' ? 'اكتمل في' : 'Completed', move.completed_at ? format(new Date(move.completed_at), 'dd MMM yyyy, HH:mm') : '—')}
        {row(lang === 'ar' ? 'أنشئ في' : 'Created', format(new Date(move.created_at), 'dd MMM yyyy, HH:mm'))}
      </div>
    </div>
  )
}
