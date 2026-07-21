'use client'

// MKT-21 — MFA login-time challenge page. The middleware /platform gate redirects
// aal1 sessions here (admin has an enrolled factor but hasn't stepped up). We
// challenge the enrolled TOTP factor and verify the 6-digit code; on success the
// browser client persists a fresh aal2 session to cookies, so the middleware lets
// the redirect back to `next` through. Fully client-side — the tokens live in the
// browser session, not the Edge middleware.

import { Suspense, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import {
  pageStyle, sectionCard, pageTitle, pageSubtitle,
  primaryBtn, inputStyle, labelStyle, C, F,
} from '@/lib/brand'

const STR = {
  en: {
    title: 'Two-factor authentication',
    subtitle: 'Enter the 6-digit code from your authenticator app to continue.',
    code: '6-digit code', verify: 'Verify', verifying: 'Verifying…',
    loading: 'Loading…',
    noFactor: 'No authenticator app is enrolled on this account. Contact your administrator.',
  },
  ar: {
    title: 'المصادقة الثنائية',
    subtitle: 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة للمتابعة.',
    code: 'الرمز المكوّن من 6 أرقام', verify: 'تحقق', verifying: 'جارٍ التحقق…',
    loading: 'جارٍ التحميل…',
    noFactor: 'لا يوجد تطبيق مصادقة مسجّل على هذا الحساب. تواصل مع المسؤول.',
  },
} as const

// Only allow same-origin relative paths to prevent open-redirect via ?next=.
function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) return next
  return '/platform'
}

function MfaChallenge() {
  const supabase = createClient()
  const { lang, isRTL } = useLanguage()
  const s = STR[lang === 'ar' ? 'ar' : 'en']
  const params = useSearchParams()
  const next = safeNext(params.get('next'))

  const [loading, setLoading] = useState(true)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase.auth.mfa.listFactors()
      if (err) throw err
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const verified = (data?.all ?? []).find((f: any) => f.status === 'verified' && f.factor_type === 'totp')
      setFactorId(verified?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load MFA state')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function verify() {
    if (!factorId) return
    setBusy(true); setError(null)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId })
      if (chErr) throw chErr
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId, challengeId: ch.id, code: code.trim(),
      })
      if (vErr) throw vErr
      // Session is now aal2 and persisted to cookies — hand back to the target.
      window.location.assign(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
      setBusy(false)
    }
  }

  const dir = isRTL ? 'rtl' : 'ltr'
  const font = lang === 'ar' ? F.ar : F.en

  return (
    <div style={{ ...pageStyle, fontFamily: font, maxWidth: 440, margin: '0 auto' }} dir={dir}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={pageTitle}>{s.title}</h1>
        <p style={pageSubtitle}>{s.subtitle}</p>
      </div>

      {error && (
        <div style={{ ...sectionCard, background: C.dangerBg, borderColor: C.dangerBorder, color: C.danger }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={sectionCard}>{s.loading}</div>
      ) : !factorId ? (
        <div style={sectionCard}>{s.noFactor}</div>
      ) : (
        <div style={sectionCard}>
          <label style={labelStyle}>{s.code}</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              style={{ ...inputStyle, maxWidth: 180 }}
              inputMode="numeric" autoComplete="one-time-code" autoFocus
              value={code} onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && code.trim().length >= 6 && !busy) verify() }}
              placeholder="000000"
            />
            <button style={primaryBtn} disabled={busy || code.trim().length < 6} onClick={verify}>
              {busy ? s.verifying : s.verify}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function MfaPage() {
  return (
    <Suspense fallback={null}>
      <MfaChallenge />
    </Suspense>
  )
}
