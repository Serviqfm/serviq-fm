'use client'

// MKT-21 — Per-user MFA (TOTP) using Supabase Auth's built-in MFA
// (supabase.auth.mfa). Account-level, opt-in. No enforcement at login yet
// (that's a follow-up touching middleware — see note at bottom of file).

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import {
  pageStyle, sectionCard, pageTitle, pageSubtitle,
  primaryBtn, secondaryBtn, dangerBtn, inputStyle, labelStyle, C, F,
} from '@/lib/brand'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Factor = any

const STR = {
  en: {
    title: 'Security', subtitle: 'Two-factor authentication (2FA) for your account',
    aalOn: 'Your session is verified with two-factor authentication.',
    aalNeed: 'Two-factor authentication is enabled but this session has not been verified yet.',
    aalOff: 'Two-factor authentication is not set up for your account.',
    enrolled: 'Authenticator apps', none: 'No authenticator app enrolled.',
    verified: 'Verified', pending: 'Pending verification',
    add: 'Add authenticator app', scan: 'Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code.',
    secretHint: 'Or enter this setup key manually:',
    code: '6-digit code', verify: 'Verify & enable', cancel: 'Cancel',
    remove: 'Remove', removing: 'Removing…', confirmRemove: 'Remove this authenticator? You may need it to sign in.',
    codeLabel: 'Enter the current 6-digit code to verify this session',
    verifySession: 'Verify session',
    loading: 'Loading…',
  },
  ar: {
    title: 'الأمان', subtitle: 'المصادقة الثنائية (2FA) لحسابك',
    aalOn: 'تم التحقق من جلستك بالمصادقة الثنائية.',
    aalNeed: 'المصادقة الثنائية مفعّلة لكن لم يتم التحقق من هذه الجلسة بعد.',
    aalOff: 'المصادقة الثنائية غير مُعدّة لحسابك.',
    enrolled: 'تطبيقات المصادقة', none: 'لا يوجد تطبيق مصادقة مسجّل.',
    verified: 'مُتحقّق', pending: 'بانتظار التحقق',
    add: 'إضافة تطبيق مصادقة', scan: 'امسح رمز QR بتطبيق المصادقة (Google Authenticator أو Authy أو 1Password) ثم أدخل الرمز المكوّن من 6 أرقام.',
    secretHint: 'أو أدخل مفتاح الإعداد يدويًا:',
    code: 'الرمز المكوّن من 6 أرقام', verify: 'التحقق والتفعيل', cancel: 'إلغاء',
    remove: 'إزالة', removing: 'جارٍ الإزالة…', confirmRemove: 'إزالة تطبيق المصادقة هذا؟ قد تحتاجه لتسجيل الدخول.',
    codeLabel: 'أدخل الرمز الحالي المكوّن من 6 أرقام للتحقق من هذه الجلسة',
    verifySession: 'التحقق من الجلسة',
    loading: 'جارٍ التحميل…',
  },
} as const

export default function SecurityPage() {
  const supabase = createClient()
  const { lang, isRTL } = useLanguage()
  const s = STR[lang === 'ar' ? 'ar' : 'en']

  const [loading, setLoading] = useState(true)
  const [factors, setFactors] = useState<Factor[]>([])
  const [aal, setAal] = useState<{ currentLevel: string | null; nextLevel: string | null }>({ currentLevel: null, nextLevel: null })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // enrollment-in-progress state
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')

  // step-up (challenge existing factor to raise this session to aal2)
  const [stepUpCode, setStepUpCode] = useState('')

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [{ data: fData, error: fErr }, { data: aData, error: aErr }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ])
      if (fErr) throw fErr
      if (aErr) throw aErr
      // listFactors returns { all, totp, phone } — show all TOTP factors
      setFactors(fData?.all ?? [])
      setAal({ currentLevel: aData?.currentLevel ?? null, nextLevel: aData?.nextLevel ?? null })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load MFA state')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { refresh() }, [refresh])

  async function startEnroll() {
    setBusy(true); setError(null)
    try {
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (err) throw err
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
      setCode('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enroll failed')
    } finally {
      setBusy(false)
    }
  }

  async function verifyEnroll() {
    if (!enroll) return
    setBusy(true); setError(null)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId })
      if (chErr) throw chErr
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enroll.factorId, challengeId: ch.id, code: code.trim(),
      })
      if (vErr) throw vErr
      setEnroll(null); setCode('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  async function cancelEnroll() {
    if (!enroll) return
    // unenroll the half-created (unverified) factor so it doesn't linger
    const id = enroll.factorId
    setEnroll(null); setCode('')
    await supabase.auth.mfa.unenroll({ factorId: id })
    await refresh()
  }

  async function remove(factorId: string) {
    if (!window.confirm(s.confirmRemove)) return
    setBusy(true); setError(null)
    try {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId })
      if (err) throw err
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed')
    } finally {
      setBusy(false)
    }
  }

  // Step up an already-enrolled session from aal1 → aal2
  async function verifySession() {
    const verified = factors.find((f) => f.status === 'verified')
    if (!verified) return
    setBusy(true); setError(null)
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: verified.id })
      if (chErr) throw chErr
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: verified.id, challengeId: ch.id, code: stepUpCode.trim(),
      })
      if (vErr) throw vErr
      setStepUpCode('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  const dir = isRTL ? 'rtl' : 'ltr'
  const font = lang === 'ar' ? F.ar : F.en
  const verifiedFactors = factors.filter((f) => f.status === 'verified')
  const needsStepUp = aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2'

  // AAL banner
  let banner: string = s.aalOff
  let bannerColor: string = C.textMid
  if (aal.currentLevel === 'aal2') { banner = s.aalOn; bannerColor = C.success }
  else if (needsStepUp) { banner = s.aalNeed; bannerColor = C.warning }

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

      {loading ? (
        <div style={sectionCard}>{s.loading}</div>
      ) : (
        <>
          <div style={{ ...sectionCard, borderInlineStart: `3px solid ${bannerColor}` }}>
            <span style={{ color: bannerColor, fontWeight: 600, fontSize: 14 }}>{banner}</span>
          </div>

          {/* Step-up challenge if the session is aal1 but a verified factor exists */}
          {needsStepUp && verifiedFactors.length > 0 && !enroll && (
            <div style={sectionCard}>
              <label style={labelStyle}>{s.codeLabel}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  style={{ ...inputStyle, maxWidth: 180 }}
                  inputMode="numeric" autoComplete="one-time-code"
                  value={stepUpCode} onChange={(e) => setStepUpCode(e.target.value)}
                  placeholder="000000"
                />
                <button style={primaryBtn} disabled={busy || stepUpCode.length < 6} onClick={verifySession}>
                  {s.verifySession}
                </button>
              </div>
            </div>
          )}

          {/* Enrolled factors */}
          <div style={sectionCard}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: '0 0 12px', fontFamily: font }}>
              {s.enrolled}
            </h2>
            {verifiedFactors.length === 0 ? (
              <p style={{ color: C.textLight, fontSize: 14, margin: 0 }}>{s.none}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {verifiedFactors.map((f) => (
                  <li key={f.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.textDark }}>
                        {f.friendly_name || 'Authenticator'}
                      </div>
                      <div style={{ fontSize: 12, color: C.success }}>{s.verified}</div>
                    </div>
                    <button style={dangerBtn} disabled={busy} onClick={() => remove(f.id)}>
                      {busy ? s.removing : s.remove}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Enrollment flow */}
          {enroll ? (
            <div style={sectionCard}>
              <p style={{ fontSize: 14, color: C.textMid, marginTop: 0 }}>{s.scan}</p>
              {/* Supabase returns qr_code as an SVG data URI — render directly */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enroll.qr} alt="TOTP QR code" width={200} height={200}
                style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.white }} />
              <p style={{ fontSize: 12, color: C.textLight, margin: '12px 0 4px' }}>{s.secretHint}</p>
              <code style={{
                display: 'inline-block', fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.1em',
                background: C.pageBg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px',
                wordBreak: 'break-all',
              }}>{enroll.secret}</code>

              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>{s.code}</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    style={{ ...inputStyle, maxWidth: 180 }}
                    inputMode="numeric" autoComplete="one-time-code"
                    value={code} onChange={(e) => setCode(e.target.value)}
                    placeholder="000000"
                  />
                  <button style={primaryBtn} disabled={busy || code.length < 6} onClick={verifyEnroll}>
                    {s.verify}
                  </button>
                  <button style={secondaryBtn} disabled={busy} onClick={cancelEnroll}>
                    {s.cancel}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button style={primaryBtn} disabled={busy} onClick={startEnroll}>
              {s.add}
            </button>
          )}
        </>
      )}

      {/*
        ENFORCEMENT NOTE (follow-up, touches middleware — out of scope here):
        To force MFA for platform/tenant admins, the middleware guarding
        /platform/* (and optionally /dashboard/*) would call
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(): if the user's role
        is admin and nextLevel === 'aal2' but currentLevel !== 'aal2', redirect
        to a step-up page (the "Verify session" card above) before granting
        access. New admin sessions with no enrolled factor would be redirected
        here to enroll first. Kept out of this PR to avoid editing middleware.
      */}
    </div>
  )
}
