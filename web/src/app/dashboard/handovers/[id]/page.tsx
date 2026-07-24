'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { formatHijri } from '@/lib/hijri'
import { STATUSES, dirLabel, statusLabel, type ChecklistItem } from '../labels'

export default function HandoverDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const ar = lang === 'ar'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [row, setRow] = useState<any>(null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
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
    const { data } = await supabase.from('unit_handovers')
      .select('*, site:site_id(name), asset:asset_id(name), creator:created_by(full_name)')
      .eq('id', id).single()
    if (data) { setRow(data); setChecklist(Array.isArray(data.checklist) ? data.checklist : []) }
    setLoading(false)
  }

  const done = row?.status === 'completed'
  const locked = !canEdit || done

  function setItem(i: number, patch: Partial<ChecklistItem>) {
    setChecklist(cl => cl.map((it, idx) => idx === i ? { ...it, ...patch } : it))
  }
  function addItem() { setChecklist(cl => [...cl, { item: '', ok: false, note: '' }]) }
  function removeItem(i: number) { setChecklist(cl => cl.filter((_, idx) => idx !== i)) }

  async function persist(patch: Record<string, unknown>) {
    setSaving(true); setError('')
    const { error: e } = await supabase.from('unit_handovers').update(patch).eq('id', id)
    if (e) { setError(e.message); setSaving(false); return false }
    await load(); setSaving(false); return true
  }

  const saveChecklist = () => persist({
    checklist: checklist.filter(it => it.item.trim()),
    ...(row.status === 'draft' ? { status: 'in_progress' } : {}),
  })
  const complete = () => persist({
    checklist: checklist.filter(it => it.item.trim()),
    status: 'completed', completed_at: new Date().toISOString(),
  })

  if (loading) return <div style={{ padding: '2rem' }}>{t('common.loading')}</div>
  if (!row) return <div style={{ padding: '2rem' }}>{ar ? 'التسليم غير موجود.' : 'Handover not found.'}</div>

  const okCount = checklist.filter(it => it.ok).length
  const chip = { padding: '3px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600 as const }
  const inputStyle = { width: '100%', padding: '6px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const, background: locked ? '#f7f7f7' : 'white' }

  return (
    <div style={{ padding: '2rem', maxWidth: 820, margin: '0 auto' }}>
      <a href='/dashboard/handovers' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
        {ar ? 'رجوع للتسليمات' : 'Back to Handovers'}
      </a>

      <div style={{ margin: '0.75rem 0 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{row.unit_label}</h1>
          <span style={{ ...chip, background: '#eef', color: '#334' }}>{dirLabel(row.direction, ar)}</span>
          <span style={{ ...chip, background: '#f0f0f0', color: '#555' }}>{statusLabel(row.status, ar)}</span>
        </div>
        <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>
          {row.occupant_name && (ar ? 'الساكن: ' : 'Occupant: ') + row.occupant_name}
          {row.site?.name && ' · ' + row.site.name}
          {row.asset?.name && ' · ' + row.asset.name}
        </p>
        {/* FM-30 — handover date in Gregorian and Hijri (Umm al-Qura). */}
        <p style={{ color: '#999', fontSize: 13, marginTop: 2 }}>
          {ar ? 'تاريخ التسليم: ' : 'Handover date: '}
          {format(new Date(row.created_at), 'dd MMM yyyy')}
          {' · '}
          <span title={ar ? 'التقويم الهجري' : 'Hijri calendar'}>{formatHijri(row.created_at, ar)} {ar ? 'هـ' : 'AH'}</span>
        </p>
        {row.completed_at && (
          <p style={{ color: '#2e7d32', fontSize: 13, marginTop: 2 }}>
            {ar ? 'اكتمل في: ' : 'Completed: '}{format(new Date(row.completed_at), 'dd MMM yyyy, HH:mm')}
          </p>
        )}
      </div>

      {/* Checklist */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{ar ? 'قائمة الفحص' : 'Checklist'}</h2>
        <span style={{ fontSize: 12, color: '#999' }}>{okCount}/{checklist.length} {ar ? 'مكتمل' : 'checked'}</span>
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden', marginBottom: '1.25rem' }}>
        {checklist.length === 0 && (
          <p style={{ padding: '1rem', margin: 0, fontSize: 13, color: '#999' }}>{ar ? 'لا توجد عناصر.' : 'No items.'}</p>
        )}
        {checklist.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderBottom: '1px solid #f2f2f2' }}>
            <input type='checkbox' checked={it.ok} disabled={locked}
              onChange={e => setItem(i, { ok: e.target.checked })} style={{ marginTop: 8, width: 18, height: 18, flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input value={it.item} disabled={locked} onChange={e => setItem(i, { item: e.target.value })}
                placeholder={ar ? 'عنصر الفحص' : 'Checklist item'}
                style={{ ...inputStyle, fontWeight: 500, textDecoration: it.ok ? 'line-through' : 'none' }} />
              <input value={it.note} disabled={locked} onChange={e => setItem(i, { note: e.target.value })}
                placeholder={ar ? 'ملاحظة (اختياري)' : 'Note (optional)'} style={{ ...inputStyle, color: '#666' }} />
            </div>
            {!locked && (
              <button onClick={() => removeItem(i)} title={ar ? 'حذف' : 'Remove'}
                style={{ marginTop: 4, border: 'none', background: 'transparent', color: '#c33', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
            )}
          </div>
        ))}
      </div>

      {error && <p style={{ color: 'red', fontSize: 13 }}>{error}</p>}

      {!locked ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={addItem}
            style={{ padding: '8px 16px', background: 'white', color: '#1a1a2e', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            + {ar ? 'إضافة عنصر' : 'Add item'}
          </button>
          <button onClick={saveChecklist} disabled={saving}
            style={{ padding: '8px 20px', background: 'white', color: '#1a1a2e', border: '1px solid #1a1a2e', borderRadius: 8, cursor: 'pointer', fontSize: 13, opacity: saving ? 0.7 : 1 }}>
            {saving ? t('common.saving') : (ar ? 'حفظ القائمة' : 'Save checklist')}
          </button>
          <button onClick={complete} disabled={saving}
            style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {ar ? 'إتمام التسليم' : 'Complete handover'}
          </button>
        </div>
      ) : done ? (
        <p style={{ fontSize: 13, color: '#2e7d32' }}>{ar ? 'اكتمل هذا التسليم.' : 'This handover is complete.'}</p>
      ) : (
        <p style={{ fontSize: 12, color: '#999' }}>{ar ? 'فقط المدراء يمكنهم تعديل التسليم.' : 'Only managers can edit this handover.'}</p>
      )}
    </div>
  )
}
