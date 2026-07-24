'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useParams, useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

const TYPE_LABEL: Record<string, { en: string; ar: string }> = {
  hot_work:          { en: 'Hot Work',          ar: 'أعمال ساخنة' },
  confined_space:    { en: 'Confined Space',    ar: 'مكان محصور' },
  electrical:        { en: 'Electrical',        ar: 'كهربائي' },
  working_at_height: { en: 'Working at Height', ar: 'العمل على ارتفاع' },
  excavation:        { en: 'Excavation',        ar: 'حفر' },
  general:           { en: 'General',           ar: 'عام' },
}

const STATUS_CFG: Record<string, { bg: string; color: string; en: string; ar: string }> = {
  draft:     { bg: '#eee',    color: '#666',    en: 'Draft',     ar: 'مسودة' },
  requested: { bg: '#fff8e1', color: '#f57f17', en: 'Requested', ar: 'مطلوب' },
  approved:  { bg: '#e3f2fd', color: '#1565c0', en: 'Approved',  ar: 'معتمد' },
  active:    { bg: '#e8f5e9', color: '#2e7d32', en: 'Active',    ar: 'نشط' },
  closed:    { bg: '#eee',    color: '#666',    en: 'Closed',    ar: 'مغلق' },
  rejected:  { bg: '#fce4ec', color: '#b71c1c', en: 'Rejected',  ar: 'مرفوض' },
}

export default function PermitDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = createClient()
  const { lang } = useLanguage()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [permit, setPermit] = useState<any>(null)
  const [role, setRole] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPermit() }, [id])

  async function fetchPermit() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUserId(user.id)
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (profile) setRole(profile.role)
    }
    const { data } = await supabase.from('work_permits')
      .select('*, work_order:work_order_id(id, title), requester:requested_by(full_name), approver:approved_by(full_name)')
      .eq('id', id).single()
    if (data) setPermit(data)
    setLoading(false)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function transition(patch: Record<string, any>) {
    setBusy(true)
    const { error } = await supabase.from('work_permits').update(patch).eq('id', id)
    if (error) { alert(error.message); setBusy(false); return }
    await fetchPermit()
    setBusy(false)
  }

  async function del() {
    if (!confirm(lang === 'ar' ? 'حذف هذا التصريح؟' : 'Delete this permit?')) return
    setBusy(true)
    const { error } = await supabase.from('work_permits').delete().eq('id', id)
    if (error) { alert(error.message); setBusy(false); return }
    router.push('/dashboard/permits')
  }

  if (loading) return <div style={{ padding: '2rem' }}>{lang === 'ar' ? 'جار التحميل...' : 'Loading...'}</div>
  if (!permit) return <div style={{ padding: '2rem' }}>{lang === 'ar' ? 'التصريح غير موجود' : 'Permit not found.'}</div>

  const isManager = role === 'admin' || role === 'manager'
  const s = STATUS_CFG[permit.status] ?? STATUS_CFG.draft
  const tl = TYPE_LABEL[permit.permit_type]
  const btn = (bg: string) => ({ padding: '9px 18px', borderRadius: 8, border: 'none', background: bg, color: 'white', cursor: busy ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, opacity: busy ? 0.6 : 1 })

  // Lifecycle actions available for the current status (all writes are admin/manager via RLS).
  const actions: React.ReactNode[] = []
  if (permit.status === 'draft' && isManager)
    actions.push(<button key='req' disabled={busy} onClick={() => transition({ status: 'requested' })} style={btn('#f57f17')}>{lang === 'ar' ? 'إرسال الطلب' : 'Submit Request'}</button>)
  if (permit.status === 'requested' && isManager) {
    actions.push(<button key='app' disabled={busy} onClick={() => transition({ status: 'approved', approved_by: userId })} style={btn('#1565c0')}>{lang === 'ar' ? 'اعتماد' : 'Approve'}</button>)
    actions.push(<button key='rej' disabled={busy} onClick={() => transition({ status: 'rejected' })} style={btn('#b71c1c')}>{lang === 'ar' ? 'رفض' : 'Reject'}</button>)
  }
  if (permit.status === 'approved' && isManager)
    actions.push(<button key='act' disabled={busy} onClick={() => transition({ status: 'active' })} style={btn('#2e7d32')}>{lang === 'ar' ? 'تفعيل' : 'Activate'}</button>)
  if (permit.status === 'active' && isManager)
    actions.push(<button key='cls' disabled={busy} onClick={() => transition({ status: 'closed' })} style={btn('#455a64')}>{lang === 'ar' ? 'إغلاق' : 'Close'}</button>)

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
      <span style={{ fontSize: 13, color: '#999', width: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: '#333' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ padding: '2rem', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <a href='/dashboard/permits' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع للتصاريح' : 'Back to Permits'}</a>
        {isManager && (
          <button disabled={busy} onClick={del} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#b71c1c', cursor: 'pointer', fontSize: 13 }}>{lang === 'ar' ? 'حذف' : 'Delete'}</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{tl ? (lang === 'ar' ? tl.ar : tl.en) : permit.permit_type}</h1>
        <span style={{ background: s.bg, color: s.color, padding: '3px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>{lang === 'ar' ? s.ar : s.en}</span>
      </div>

      {actions.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: '1.5rem', flexWrap: 'wrap' }}>{actions}</div>
      )}

      <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 10, padding: '0 1.25rem' }}>
        {row(lang === 'ar' ? 'أمر العمل' : 'Work Order', permit.work_order
          ? <a href={'/dashboard/work-orders/' + permit.work_order.id} style={{ color: '#1565c0', textDecoration: 'none' }}>{permit.work_order.title}</a>
          : '—')}
        {row(lang === 'ar' ? 'صالح من' : 'Valid From', permit.valid_from ? format(new Date(permit.valid_from), 'dd MMM yyyy, HH:mm') : '—')}
        {row(lang === 'ar' ? 'صالح إلى' : 'Valid To', permit.valid_to ? format(new Date(permit.valid_to), 'dd MMM yyyy, HH:mm') : '—')}
        {row(lang === 'ar' ? 'المخاطر' : 'Hazards', <span style={{ whiteSpace: 'pre-wrap' }}>{permit.hazards || '—'}</span>)}
        {row(lang === 'ar' ? 'إجراءات التحكم' : 'Controls', <span style={{ whiteSpace: 'pre-wrap' }}>{permit.controls || '—'}</span>)}
        {row(lang === 'ar' ? 'مقدم الطلب' : 'Requested By', permit.requester?.full_name ?? '—')}
        {row(lang === 'ar' ? 'المعتمد' : 'Approved By', permit.approver?.full_name ?? '—')}
        {row(lang === 'ar' ? 'أنشئ في' : 'Created', format(new Date(permit.created_at), 'dd MMM yyyy, HH:mm'))}
      </div>
    </div>
  )
}
