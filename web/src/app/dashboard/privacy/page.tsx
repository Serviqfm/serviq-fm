'use client'

// AP-08 PDPL — self-service privacy centre: export your own data, read the
// retention notice, and (admins) work the account-deletion queue.

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import {
  pageStyle, sectionCard, pageTitle, pageSubtitle,
  primaryBtn, dangerBtn, C, F,
} from '@/lib/brand'

type DReq = { id: string; user_id: string | null; email: string | null; requested_at: string }

const STR = {
  en: {
    title: 'Privacy & Data', subtitle: 'Your data, retention, and deletion requests',
    exportTitle: 'Export my data',
    exportBody: 'Download a JSON copy of your personal data — your profile, the work orders you created or were assigned, your comments, time logs, requests, and notification preferences. Scoped strictly to your own account.',
    exportBtn: 'Download my data (JSON)',
    retentionTitle: 'What we retain',
    retention: [
      ['Structured data', 'Work orders, assets and maintenance logs are retained for as long as your organisation keeps its account.'],
      ['Images & video', 'Automatically purged 6 months after upload. Export any media you need before then.'],
      ['Advance notice', 'Your organisation is emailed 30 days before any media purge.'],
      ['Account deletion', 'Request deletion from the mobile app; an admin then erases your personal fields while keeping anonymised audit records.'],
    ],
    queueTitle: 'Account deletion requests',
    queueEmpty: 'No pending deletion requests.',
    process: 'Erase & process', processing: 'Processing…',
    confirmProcess: 'Erase this user\'s personal data? Their name, phone and email are anonymised and the account is disabled. Audit records are kept. This cannot be undone.',
    requestedOn: 'Requested', loading: 'Loading…',
  },
  ar: {
    title: 'الخصوصية والبيانات', subtitle: 'بياناتك والاحتفاظ بها وطلبات الحذف',
    exportTitle: 'تصدير بياناتي',
    exportBody: 'حمّل نسخة JSON من بياناتك الشخصية — ملفك الشخصي وأوامر العمل التي أنشأتها أو أُسندت إليك وتعليقاتك وسجلات الوقت والطلبات وتفضيلات الإشعارات. مقيّدة بحسابك وحدك.',
    exportBtn: 'تنزيل بياناتي (JSON)',
    retentionTitle: 'ما الذي نحتفظ به',
    retention: [
      ['البيانات الهيكلية', 'يتم الاحتفاظ بأوامر العمل والأصول وسجلات الصيانة طالما احتفظت مؤسستك بحسابها.'],
      ['الصور والفيديو', 'تُحذف تلقائياً بعد 6 أشهر من الرفع. صدّر ما تحتاجه من الوسائط قبل ذلك.'],
      ['إشعار مسبق', 'تُبلَّغ مؤسستك بالبريد الإلكتروني قبل 30 يوماً من أي حذف للوسائط.'],
      ['حذف الحساب', 'اطلب الحذف من تطبيق الجوال، ثم يقوم المشرف بمسح حقولك الشخصية مع الاحتفاظ بسجلات تدقيق مجهّلة الهوية.'],
    ],
    queueTitle: 'طلبات حذف الحسابات',
    queueEmpty: 'لا توجد طلبات حذف معلّقة.',
    process: 'مسح ومعالجة', processing: 'جارٍ المعالجة…',
    confirmProcess: 'مسح البيانات الشخصية لهذا المستخدم؟ يتم تجهيل الاسم والهاتف والبريد وتعطيل الحساب. تُحفظ سجلات التدقيق. لا يمكن التراجع.',
    requestedOn: 'طُلب في', loading: 'جارٍ التحميل…',
  },
} as const

export default function PrivacyPage() {
  const supabase = createClient()
  const { lang, isRTL } = useLanguage()
  const s = STR[lang === 'ar' ? 'ar' : 'en']

  const [role, setRole] = useState<string | null>(null)
  const [reqs, setReqs] = useState<DReq[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true); setError(null)
    try {
      const res = await fetch('/api/account/deletion-requests')
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load')
      setReqs((await res.json()).requests ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoadingQueue(false)
    }
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      setRole(profile?.role ?? null)
      if (profile?.role === 'admin') loadQueue()
    })()
  }, [supabase, loadQueue])

  async function process(id: string) {
    if (!window.confirm(s.confirmProcess)) return
    setBusyId(id); setError(null)
    try {
      const res = await fetch('/api/account/deletion-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to process')
      setReqs(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process')
    } finally {
      setBusyId(null)
    }
  }

  const dir = isRTL ? 'rtl' : 'ltr'
  const font = lang === 'ar' ? F.ar : F.en

  return (
    <div style={{ ...pageStyle, fontFamily: font }} dir={dir}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={pageTitle}>{s.title}</h1>
        <p style={pageSubtitle}>{s.subtitle}</p>
      </div>

      {error && (
        <div style={{ ...sectionCard, background: C.dangerBg, borderColor: C.dangerBorder, color: C.danger }}>
          {error}
        </div>
      )}

      {/* Export my data */}
      <div style={sectionCard}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: '0 0 8px', fontFamily: font }}>{s.exportTitle}</h2>
        <p style={{ fontSize: 14, color: C.textMid, margin: '0 0 16px', fontFamily: font }}>{s.exportBody}</p>
        {/* Plain download link — GET carries the auth cookie; server sends the attachment. */}
        <a href="/api/account/export" download style={{ ...primaryBtn, display: 'inline-block', textDecoration: 'none' }}>
          {s.exportBtn}
        </a>
      </div>

      {/* Retention notice */}
      <div style={sectionCard}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: '0 0 12px', fontFamily: font }}>{s.retentionTitle}</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {s.retention.map(([term, desc]) => (
            <li key={term} style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.textDark, fontFamily: font }}>{term}</div>
              <div style={{ fontSize: 13, color: C.textMid, fontFamily: font }}>{desc}</div>
            </li>
          ))}
        </ul>
      </div>

      {/* Admin deletion queue */}
      {role === 'admin' && (
        <div style={sectionCard}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: '0 0 12px', fontFamily: font }}>{s.queueTitle}</h2>
          {loadingQueue ? (
            <p style={{ fontSize: 14, color: C.textLight, margin: 0, fontFamily: font }}>{s.loading}</p>
          ) : reqs.length === 0 ? (
            <p style={{ fontSize: 14, color: C.textLight, margin: 0, fontFamily: font }}>{s.queueEmpty}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {reqs.map(r => (
                <li key={r.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.border}`,
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.textDark, fontFamily: font }}>{r.email ?? r.user_id}</div>
                    <div style={{ fontSize: 12, color: C.textLight, fontFamily: font }}>
                      {s.requestedOn}: {new Date(r.requested_at).toLocaleDateString(lang === 'ar' ? 'ar' : 'en')}
                    </div>
                  </div>
                  <button style={dangerBtn} disabled={busyId === r.id} onClick={() => process(r.id)}>
                    {busyId === r.id ? s.processing : s.process}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
