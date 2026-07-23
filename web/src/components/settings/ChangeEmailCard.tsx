'use client'

import { useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 1C-21: self-service email change on Settings → Account. supabase.auth.updateUser
// sends confirmation link(s) — with Supabase's default "secure email change" one to
// BOTH the old and new address — and auth.users.email only changes after the user
// confirms. public.users.email is synced from the auth email on the next Settings
// visit (see settings/page.tsx fetchData).
export default function ChangeEmailCard({ lang, currentEmail, initialPendingEmail }: {
  lang: string
  currentEmail: string | null
  initialPendingEmail: string | null
}) {
  const ar = lang === 'ar'
  const supabase = createClient()
  const [newEmail, setNewEmail] = useState('')
  const [pending, setPending] = useState<string | null>(initialPendingEmail)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const email = newEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) { setMsg({ ok: false, text: ar ? 'أدخل بريدًا إلكترونيًا صالحًا.' : 'Enter a valid email address.' }); return }
    if (currentEmail && email === currentEmail.toLowerCase()) { setMsg({ ok: false, text: ar ? 'هذا هو بريدك الإلكتروني الحالي.' : 'This is already your current email.' }); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ email })
    setLoading(false)
    if (error) {
      setMsg({ ok: false, text: error.message || (ar ? 'تعذّر بدء تغيير البريد الإلكتروني.' : 'Could not start the email change.') })
      return
    }
    setPending(email)
    setNewEmail('')
    setMsg({
      ok: true,
      text: ar
        ? 'تم إرسال روابط التأكيد إلى بريدك الحالي والجديد. لن يتغير بريدك حتى تؤكد من صندوق الوارد.'
        : 'Confirmation links were emailed to your current and new address. Your email changes only after you confirm from your inbox.',
    })
  }

  const inputCls = 'w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all box-border'

  return (
    <form onSubmit={submit} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
      <h3 className="text-base font-semibold text-on-surface mb-1">{ar ? 'تغيير البريد الإلكتروني' : 'Change Email'}</h3>
      <p className="text-xs text-on-surface-variant mb-4">
        {ar
          ? `بريدك الحالي: ${currentEmail ?? '-'}. سيُستخدم البريد الجديد لتسجيل الدخول بعد التأكيد.`
          : `Current email: ${currentEmail ?? '-'}. The new address becomes your login after confirmation.`}
      </p>
      {pending && (
        <p className="text-sm mb-3 px-3 py-2 rounded-lg border text-amber-700 bg-amber-100 border-amber-300">
          {ar
            ? <>تغيير معلّق إلى <strong>{pending}</strong> — تحقق من صندوق الوارد لتأكيده.</>
            : <>Pending change to <strong>{pending}</strong> — check your inbox to confirm it.</>}
        </p>
      )}
      <input className={inputCls} type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
        placeholder={ar ? 'البريد الإلكتروني الجديد' : 'New email address'} autoComplete="email" />
      {msg && (
        <p className={`text-sm mt-3 px-3 py-2 rounded-lg border ${msg.ok ? 'text-primary bg-primary/10 border-primary/20' : 'text-error bg-error/10 border-error/20'}`}>{msg.text}</p>
      )}
      <button type="submit" disabled={loading} className="mt-4 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-70">
        {loading ? (ar ? 'جارٍ الإرسال…' : 'Sending…') : (ar ? 'إرسال رابط التأكيد' : 'Send Confirmation Link')}
      </button>
    </form>
  )
}
