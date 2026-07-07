'use client'

import { useState, type FormEvent } from 'react'

// Voluntary password change on the dashboard Settings → Account tab (DV-08). Posts to
// the shared /api/account/password route (session-authenticated).
export default function ChangePasswordCard({ lang }: { lang: string }) {
  const ar = lang === 'ar'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (password.length < 8) { setMsg({ ok: false, text: ar ? 'يجب ألا تقل كلمة المرور عن 8 أحرف.' : 'Password must be at least 8 characters.' }); return }
    if (password !== confirm) { setMsg({ ok: false, text: ar ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.' }); return }
    setLoading(true)
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setMsg({ ok: false, text: j.error || (ar ? 'تعذّر تحديث كلمة المرور.' : 'Could not update password.') })
      return
    }
    setPassword(''); setConfirm('')
    setMsg({ ok: true, text: ar ? 'تم تحديث كلمة المرور.' : 'Password updated.' })
  }

  const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all box-border'

  return (
    <form onSubmit={submit} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
      <h3 className="text-base font-semibold text-on-surface mb-4">{ar ? 'تغيير كلمة المرور' : 'Change Password'}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input className={inputCls} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={ar ? 'كلمة مرور جديدة' : 'New password'} autoComplete="new-password" />
        <input className={inputCls} type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={ar ? 'تأكيد كلمة المرور' : 'Confirm password'} autoComplete="new-password" />
      </div>
      {msg && (
        <p className={`text-sm mt-3 px-3 py-2 rounded-lg border ${msg.ok ? 'text-primary bg-primary/10 border-primary/20' : 'text-error bg-error/10 border-error/20'}`}>{msg.text}</p>
      )}
      <button type="submit" disabled={loading} className="mt-4 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-70">
        {loading ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'تحديث كلمة المرور' : 'Update Password')}
      </button>
    </form>
  )
}
