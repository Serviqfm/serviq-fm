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

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('users').update({ is_active: !current, updated_at: new Date().toISOString() }).eq('id', id)
    fetchUsers()
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
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${u.is_active !== false ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                          {u.is_active !== false ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">
                        {u.last_sign_in_at ? format(new Date(u.last_sign_in_at), 'dd MMM yyyy') : '—'}
                      </td>
                      <td className="p-3">
                        {currentUser?.role === 'admin' && !isMe && (
                          <div className="flex gap-2">
                            <Link href={'/dashboard/users/' + u.id + '/edit'}>
                              <button className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                            </Link>
                            <button onClick={() => toggleActive(u.id, u.is_active !== false)}
                              className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">
                              {u.is_active !== false ? t('common.deactivate') : t('common.activate')}
                            </button>
                            <button onClick={() => deleteUser(u.id, u.email)}
                              className="px-3 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">
                              Delete
                            </button>
                          </div>
                        )}
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
