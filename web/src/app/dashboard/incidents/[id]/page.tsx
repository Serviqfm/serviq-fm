'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { STATUSES, sevLabel, statusLabel } from '../labels'

// Lifecycle is linear: open → investigating → resolved → closed. Each stage's
// "advance" button moves to the next; entering 'resolved' also captures notes.
const NEXT: Record<string, string> = {
  open: 'investigating', investigating: 'resolved', resolved: 'closed',
}

export default function IncidentDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const ar = lang === 'ar'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inc, setInc] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [id])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      setCanEdit(profile?.role === 'admin' || profile?.role === 'manager')
    }
    const { data } = await supabase.from('incidents')
      .select('*, site:site_id(name), asset:asset_id(name), reporter:reported_by(full_name)')
      .eq('id', id).single()
    if (data) { setInc(data); setNotes(data.resolution_notes ?? '') }
    setLoading(false)
  }

  async function advance() {
    if (!inc) return
    const next = NEXT[inc.status]
    if (!next) return
    setSaving(true); setError('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = { status: next }
    if (next === 'resolved') { patch.resolution_notes = notes || null; patch.resolved_at = new Date().toISOString() }
    const { error: e } = await supabase.from('incidents').update(patch).eq('id', id)
    if (e) { setError(e.message); setSaving(false); return }
    await load(); setSaving(false)
  }

  async function saveNotes() {
    setSaving(true); setError('')
    const { error: e } = await supabase.from('incidents').update({ resolution_notes: notes || null }).eq('id', id)
    if (e) setError(e.message)
    await load(); setSaving(false)
  }

  if (loading) return <div style={{ padding: '2rem' }}>{t('common.loading')}</div>
  if (!inc) return <div style={{ padding: '2rem' }}>{ar ? 'الحادث غير موجود.' : 'Incident not found.'}</div>

  const next = NEXT[inc.status]
  const showNotes = inc.status === 'investigating' || inc.status === 'resolved' || inc.status === 'closed'
  // Corrective WO deep-link — WO create page reads asset_id / site_id from the query.
  const woParams = new URLSearchParams()
  if (inc.asset_id) woParams.set('asset_id', inc.asset_id)
  if (inc.site_id) woParams.set('site_id', inc.site_id)
  const woHref = '/dashboard/work-orders/new' + (woParams.toString() ? '?' + woParams.toString() : '')

  const chip = { padding: '3px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600 as const }

  return (
    <div style={{ padding: '2rem', maxWidth: 760, margin: '0 auto' }}>
      <a href='/dashboard/incidents' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
        {ar ? 'رجوع للحوادث' : 'Back to Incidents'}
      </a>

      <div style={{ margin: '0.75rem 0 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{inc.title}</h1>
          <span style={{ ...chip, background: '#eef', color: '#334' }}>{sevLabel(inc.severity, ar)}</span>
          <span style={{ ...chip, background: '#f0f0f0', color: '#555' }}>{statusLabel(inc.status, ar)}</span>
        </div>
        <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>
          {ar ? 'أبلغ عنه' : 'Reported by'} {inc.reporter?.full_name ?? '—'} · {format(new Date(inc.created_at), 'dd MMM yyyy, HH:mm')}
          {inc.site?.name && ' · ' + inc.site.name}
          {inc.asset?.name && ' · ' + inc.asset.name}
          {inc.occurred_at && ` · ${ar ? 'وقع في' : 'occurred'} ${format(new Date(inc.occurred_at), 'dd MMM yyyy, HH:mm')}`}
        </p>
      </div>

      {inc.description && (
        <div style={{ border: '1px solid #eee', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', whiteSpace: 'pre-wrap', fontSize: 14, color: '#333' }}>
          {inc.description}
        </div>
      )}

      {/* Lifecycle progress */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {STATUSES.map((s, i) => {
          const active = STATUSES.indexOf(inc.status) >= i
          return (
            <span key={s} style={{ ...chip, background: active ? '#1a1a2e' : '#f0f0f0', color: active ? 'white' : '#999' }}>
              {statusLabel(s, ar)}
            </span>
          )
        })}
      </div>

      {showNotes && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#444' }}>
            {ar ? 'ملاحظات الحل' : 'Resolution notes'}
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} disabled={!canEdit || inc.status === 'closed'}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', resize: 'vertical', background: (!canEdit || inc.status === 'closed') ? '#f7f7f7' : 'white' }} />
          {canEdit && inc.status !== 'closed' && (
            <button onClick={saveNotes} disabled={saving}
              style={{ marginTop: 8, padding: '6px 16px', borderRadius: 7, border: '1px solid #1a1a2e', background: 'white', color: '#1a1a2e', cursor: 'pointer', fontSize: 13 }}>
              {saving ? t('common.saving') : (ar ? 'حفظ الملاحظات' : 'Save notes')}
            </button>
          )}
        </div>
      )}

      {error && <p style={{ color: 'red', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {canEdit && next && (
          <button onClick={advance} disabled={saving}
            style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {ar ? 'انتقل إلى: ' : 'Advance to: '}{statusLabel(next, ar)}
          </button>
        )}
        <Link href={woHref}>
          <button style={{ padding: '8px 20px', background: 'white', color: '#1a1a2e', border: '1px solid #1a1a2e', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            {ar ? 'إنشاء أمر عمل تصحيحي' : 'Raise corrective work order'}
          </button>
        </Link>
      </div>

      {!canEdit && (
        <p style={{ fontSize: 12, color: '#999', marginTop: 12 }}>
          {ar ? 'فقط المدراء يمكنهم تحديث حالة الحادث.' : 'Only managers can update incident status.'}
        </p>
      )}
    </div>
  )
}
