'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Forced password change after a temp-password first login (DV-09). The dashboard
// middleware redirects here while users.must_change_password is true. This route is
// top-level (not under /dashboard), so middleware does not gate it — no redirect loop.
const cardCls = 'w-full max-w-[420px] bg-surface-container-lowest border border-outline-variant rounded-[16px] shadow-sm p-8'
const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all box-border'

export default function ChangePasswordPage() {
  const router = useRouter()
  const supabase = createClient()
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login/client'); return }
      setChecking(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(e: FormEvent) {
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
      setError(j.error || 'Could not update your password.')
      return
    }
    router.replace('/dashboard')
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      {checking ? (
        <div className={cardCls}><p className="text-on-surface-variant text-sm text-center">Loading…</p></div>
      ) : (
        <form onSubmit={submit} className={cardCls}>
          <h1 className="text-xl font-bold text-on-surface mb-1.5">Choose a new password</h1>
          <p className="text-sm text-on-surface-variant mb-5">For security, set your own password before continuing to the dashboard.</p>
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">New password</label>
          <input className={inputCls} type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5 mt-3">Confirm password</label>
          <input className={inputCls} type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" />
          {error && <p className="text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3 py-2 mt-3">{error}</p>}
          <button className="w-full py-3 bg-primary text-on-primary rounded-[10px] font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-70 mt-4" type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save and continue'}</button>
        </form>
      )}
    </div>
  )
}
