'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'

type Stage = 'loading' | 'request' | 'update' | 'sent' | 'done'

const cardCls = 'w-full max-w-[420px] bg-surface-container-lowest border border-outline-variant rounded-[16px] shadow-sm p-8'
const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all box-border'
const btnCls = 'w-full py-3 bg-primary text-on-primary rounded-[10px] font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-70'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const [stage, setStage] = useState<Stage>('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    // The browser client has detectSessionInUrl on, so it AUTO-exchanges the recovery
    // token during init (PKCE `?code=` fires SIGNED_IN; implicit `#type=recovery` fires
    // PASSWORD_RECOVERY). Do NOT exchange the code manually — that double-exchange fails
    // on the already-consumed code. Detect the resulting session instead.
    const params = new URLSearchParams(window.location.search)
    const hasRecoveryToken = params.has('code') || window.location.hash.includes('type=recovery')

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStage('update')
      else if (event === 'SIGNED_IN' && hasRecoveryToken) setStage('update')
    })

    // getSession() resolves after auth-js finishes init (including the auto-exchange).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (session && hasRecoveryToken) {
        setStage('update')
      } else if (!hasRecoveryToken) {
        setStage('request')
      } else {
        // Had a recovery token but no session was established — invalid/expired link.
        setError('That reset link is invalid or has expired — request a new one below.')
        setStage('request')
      }
    })

    return () => { active = false; sub.subscription.unsubscribe() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function requestReset(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    // We intentionally show "sent" regardless of the result so the form never reveals
    // whether an email is registered (account enumeration).
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    setStage('sent')
  }

  async function updatePassword(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error || 'Could not reset your password. The link may have expired — request a new one.')
      return
    }
    await supabase.auth.signOut()
    setStage('done')
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      {stage === 'loading' && (
        <div className={cardCls}><p className="text-on-surface-variant text-sm text-center">Loading…</p></div>
      )}

      {stage === 'request' && (
        <form onSubmit={requestReset} className={cardCls}>
          <h1 className="text-xl font-bold text-on-surface mb-1.5">Reset your password</h1>
          <p className="text-sm text-on-surface-variant mb-5">Enter your email and we&apos;ll send you a link to set a new password.</p>
          <input className={inputCls} type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
          {error && <p className="text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3 py-2 mt-3">{error}</p>}
          <button className={`${btnCls} mt-4`} type="submit" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
          <a href="/login/client" className="block text-center text-xs text-on-surface-variant hover:text-primary mt-4">Back to sign in</a>
        </form>
      )}

      {stage === 'sent' && (
        <div className={`${cardCls} text-center`}>
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 text-xl">✉</div>
          <h1 className="text-xl font-bold text-on-surface mb-2">Check your email</h1>
          <p className="text-sm text-on-surface-variant">If an account exists for <strong>{email}</strong>, a password-reset link is on its way. The link expires shortly — use it soon.</p>
          <a href="/login/client" className="block text-center text-xs text-on-surface-variant hover:text-primary mt-5">Back to sign in</a>
        </div>
      )}

      {stage === 'update' && (
        <form onSubmit={updatePassword} className={cardCls}>
          <h1 className="text-xl font-bold text-on-surface mb-1.5">Set a new password</h1>
          <p className="text-sm text-on-surface-variant mb-5">Choose a new password for your account.</p>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">New password</label>
          <input className={inputCls} type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5 mt-3">Confirm password</label>
          <input className={inputCls} type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" />
          {error && <p className="text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3 py-2 mt-3">{error}</p>}
          <button className={`${btnCls} mt-4`} type="submit" disabled={loading}>{loading ? 'Saving…' : 'Update password'}</button>
        </form>
      )}

      {stage === 'done' && (
        <div className={`${cardCls} text-center`}>
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4 text-xl">✓</div>
          <h1 className="text-xl font-bold text-on-surface mb-2">Password updated</h1>
          <p className="text-sm text-on-surface-variant mb-5">You can now sign in with your new password.</p>
          <a href="/login/client" className={btnCls + ' inline-block'} style={{ textDecoration: 'none' }}>Go to sign in</a>
        </div>
      )}
    </div>
  )
}
