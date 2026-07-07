'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

const ROLE_BADGE: Record<string, string> = {
  admin:      'bg-primary text-on-primary',
  manager:    'bg-primary/10 text-primary',
  technician: 'bg-primary/20 text-primary',
  requester:  'bg-surface-container text-on-surface-variant',
}

export default function UsersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [resendResult, setResendResult] = useState<{ email: string; fullName: string } | null>(null)
  const supabase = createClient()
  const { t, lang } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    const timeout = setTimeout(() => setLoading(false), 8000)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setCurrentUser(profile)
    if (!['admin', 'manager'].includes(profile.role)) return
    const { data } = await supabase.from('users').select('*').eq('organisation_id', profile.organisation_id).order('full_name', { ascending: true })
    if (data) setUsers(data)
    clearTimeout(timeout)
    setLoading(false)
  }

  // Pending = invited but never logged in (derived, never stored).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isPending = (u: any) => Boolean(u.invited_at) && !u.first_login_at

  // Friendly bilingual messages for the API safety-rule rejections.
  const apiErrorMessage = (code?: string, fallback?: string) => {
    const messages: Record<string, { en: string; ar: string }> = {
      self_role_change:      { en: 'You cannot change your own role. Ask another admin to do it.', ar: 'لا يمكنك تغيير دورك بنفسك. اطلب من مشرف آخر القيام بذلك.' },
      last_admin_role:       { en: 'This is the only active admin — assign another admin before changing this role.', ar: 'هذا هو المشرف النشط الوحيد — عيّن مشرفًا آخر قبل تغيير هذا الدور.' },
      last_admin_deactivate: { en: 'This is the only active admin — assign another admin before deactivating this account.', ar: 'هذا هو المشرف النشط الوحيد — عيّن مشرفًا آخر قبل إلغاء تفعيل هذا الحساب.' },
      not_pending:           { en: 'This user has already logged in — the invite can no longer be resent.', ar: 'سجّل هذا المستخدم دخوله بالفعل — لم يعد بالإمكان إعادة إرسال الدعوة.' },
    }
    const known = code ? messages[code] : undefined
    if (known) return lang === 'ar' ? known.ar : known.en
    return fallback || (lang === 'ar' ? 'حدث خطأ غير متوقع' : 'Something went wrong')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function toggleActive(u: any) {
    // Goes through the API (not a direct table update) so the last-admin
    // protection in PATCH /api/users/[id] applies.
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: u.full_name || u.email,
          full_name_ar: u.full_name_ar,
          role: u.role,
          is_active: u.is_active === false,
        }),
      })
      if (!res.ok) {
        const result = await res.json().catch(() => ({}))
        alert(apiErrorMessage(result?.code, result?.error))
      }
    } catch {
      alert(lang === 'ar' ? 'خطأ في الشبكة' : 'Network error')
    }
    fetchUsers()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function resendInvite(u: any) {
    setResendingId(u.id)
    try {
      const res = await fetch(`/api/users/${u.id}/resend-invite`, { method: 'POST' })
      const result = await res.json().catch(() => ({}))
      if (res.ok) {
        setResendResult({ email: u.email, fullName: u.full_name ?? u.email })
        fetchUsers()
      } else {
        alert(apiErrorMessage(result?.code, result?.error || (lang === 'ar' ? 'تعذر إعادة إرسال الدعوة' : 'Failed to resend invite')))
      }
    } catch {
      alert(lang === 'ar' ? 'خطأ في الشبكة أثناء إعادة إرسال الدعوة' : 'Network error while resending invite')
    }
    setResendingId(null)
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Are you sure you want to delete ${email}? This cannot be undone.`)) return
    try {
      const response = await fetch('/api/users/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: id }) })
      const result = await response.json()
      if (response.ok) { fetchUsers() } else { alert(result.error || 'Failed to delete user') }
    } catch { alert('Network error while deleting user') }
  }

  const roleCount = (role: string) => users.filter(u => u.role === role).length
  const activeCount = users.filter(u => u.is_active !== false).length

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{t('users.title')}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">{users.length} {t('users.in_org')}</p>
          </div>
          {['admin', 'manager'].includes(currentUser?.role) && (
            <Link href='/dashboard/users/new'>
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                <span className="material-symbols-outlined text-lg">person_add</span>{t('btn.add_user')}
              </button>
            </Link>
          )}
        </div>

        {/* Stats — glass cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { role: 'admin',      icon: 'admin_panel_settings', label: lang === 'ar' ? 'المشرفون' : 'Admins',      color: 'text-primary',           bg: 'bg-primary/10',      decor: 'bg-primary/5'      },
            { role: 'manager',    icon: 'manage_accounts',      label: lang === 'ar' ? 'المديرون' : 'Managers',    color: 'text-secondary',         bg: 'bg-secondary/10',    decor: 'bg-secondary/5'    },
            { role: 'technician', icon: 'engineering',          label: lang === 'ar' ? 'الفنيون' : 'Technicians', color: 'text-primary',           bg: 'bg-primary/10',      decor: 'bg-primary/5'      },
            { role: 'requester',  icon: 'assignment_ind',       label: lang === 'ar' ? 'الطالبون' : 'Requesters', color: 'text-on-surface-variant', bg: 'bg-surface-container', decor: 'bg-surface-container-high' },
          ].map(s => (
            <div key={s.role} className="bg-surface-container-lowest border border-outline-variant p-5 rounded-[12px] shadow-sm relative overflow-hidden group backdrop-blur-sm">
              <div className={`absolute top-0 right-0 w-20 h-20 -mr-6 -mt-6 rounded-full group-hover:scale-110 transition-transform duration-500 ${s.decor}`} />
              <div className={`p-2 rounded-lg w-fit mb-3 ${s.bg}`}>
                <span className={`material-symbols-outlined ${s.color}`}>{s.icon}</span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{s.label}</p>
              <p className={`text-4xl font-bold ${s.color}`}>{roleCount(s.role)}</p>
            </div>
          ))}
        </div>

        {/* Active stat strip */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-4 flex items-center justify-between">
          <span className="text-sm text-on-surface-variant">{activeCount} of {users.length} users are currently active</span>
          <div className="w-48 bg-surface-container-high h-2 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${users.length > 0 ? Math.round((activeCount / users.length) * 100) : 0}%` }} />
          </div>
        </div>

        {/* Resend-invite result — the new temp password is emailed, not shown (DV-09) */}
        {resendResult && (
          <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#1565c0', margin: '0 0 6px' }}>
                {lang === 'ar' ? 'تمت إعادة إرسال الدعوة عبر البريد الإلكتروني' : 'Invitation re-sent by email'}
              </p>
              <p style={{ fontSize: 13, margin: 0, color: '#333' }}>
                {lang === 'ar'
                  ? <>أُرسلت كلمة مرور مؤقتة جديدة إلى <strong>{resendResult.email}</strong>. سيُطلب منه تعيين كلمة مرور جديدة عند تسجيل الدخول.</>
                  : <>A new temporary password was emailed to <strong>{resendResult.email}</strong>. They&apos;ll set a new password on login.</>}
              </p>
            </div>
            <button onClick={() => setResendResult(null)} aria-label={lang === 'ar' ? 'إغلاق' : 'Dismiss'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1565c0', fontSize: 18, lineHeight: 1, padding: 4 }}>
              ×
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/30">
                  {[t('users.col.name'), t('users.col.email'), t('users.col.role'), t('common.status'), t('users.col.active'), t('common.actions')].map(h => (
                    <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {users.map(u => {
                  const isMe = u.id === currentUser?.id
                  return (
                    <tr key={u.id} className={`hover:bg-surface-container-low transition-colors ${isMe ? 'bg-primary/5' : ''}`}>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {(u.full_name ?? u.email ?? '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-on-surface">
                              {u.full_name ?? '—'}
                              {isMe && <span className="text-xs text-on-surface-variant font-normal ml-1">(you)</span>}
                            </p>
                            {u.full_name_ar && <p className="text-xs text-on-surface-variant mt-0.5" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>{u.full_name_ar}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-on-surface-variant">{u.email}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE[u.role] ?? ROLE_BADGE.requester}`}>
                          {u.role === 'admin' ? (lang === 'ar' ? 'مشرف' : 'Admin') : u.role === 'manager' ? (lang === 'ar' ? 'مدير' : 'Manager') : u.role === 'technician' ? (lang === 'ar' ? 'فني' : 'Technician') : (lang === 'ar' ? 'مقدم طلب' : 'Requester')}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {u.is_active !== false && isPending(u) ? (
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                            {lang === 'ar' ? 'بانتظار التفعيل' : 'Pending'}
                          </span>
                        ) : (
                          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${u.is_active !== false ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                            {u.is_active !== false ? t('common.active') : t('common.inactive')}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">
                        {u.last_sign_in_at ? format(new Date(u.last_sign_in_at), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          {['admin', 'manager'].includes(currentUser?.role) && !isMe && isPending(u) && (
                            <button onClick={() => resendInvite(u)} disabled={resendingId === u.id}
                              className="px-3 py-1 rounded-lg border border-amber-300 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                              {resendingId === u.id ? (lang === 'ar' ? 'جارٍ الإرسال…' : 'Sending…') : (lang === 'ar' ? 'إعادة إرسال الدعوة' : 'Resend Invite')}
                            </button>
                          )}
                          {currentUser?.role === 'admin' && !isMe && (
                            <>
                              <Link href={'/dashboard/users/' + u.id + '/edit'}>
                                <button className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                              </Link>
                              <button onClick={() => toggleActive(u)}
                                className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">
                                {u.is_active !== false ? t('common.deactivate') : t('common.activate')}
                              </button>
                              <button onClick={() => deleteUser(u.id, u.email)}
                                className="px-3 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
