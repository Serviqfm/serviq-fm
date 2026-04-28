'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, pageStyle, cardStyle, primaryBtn, secondaryBtn, tableHeaderCell, tableCell } from '@/lib/brand'

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const supabase = createClient()
  const { t, lang } = useLanguage()

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    const timeout = setTimeout(() => setLoading(false), 8000)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      if (typeof window !== 'undefined') window.location.href = '/login'
      return
    }
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

  const roleColors: Record<string, { bg: string; color: string }> = {
    admin:      { bg: C.navy,     color: C.white },
    manager:    { bg: '#e8eaf6',  color: C.navy },
    technician: { bg: '#DCFCE7',  color: C.success },
    requester:  { bg: '#fff8e1',  color: C.warning },
  }

  const roleCount = (role: string) => users.filter(u => u.role === role).length

  if (loading) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>{t('common.loading')}</div>

  return (
    <div style={{ ...pageStyle, maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{t('users.title')}</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>{users.length} {t('users.in_org')}</p>
        </div>
        {currentUser?.role === 'admin' && (
          <Link href='/dashboard/users/new'>
            <button style={primaryBtn}>{t('btn.add_user')}</button>
          </Link>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
        {['admin', 'manager', 'technician', 'requester'].map(role => {
          const cfg = roleColors[role]
          return (
            <div key={role} style={cardStyle}>
              <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 6px', fontWeight: 500 }}>
                {role === 'admin' ? (lang === 'ar' ? 'المشرف' : 'Admin') : role === 'manager' ? (lang === 'ar' ? 'المدير' : 'Manager') : role === 'technician' ? (lang === 'ar' ? 'الفني' : 'Technician') : (lang === 'ar' ? 'مقدم الطلب' : 'Requester')}s
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: C.navy, fontFamily: F.en }}>{roleCount(role)}</span>
                <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500, fontFamily: F.en }}>{role}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
              {[t('users.col.name'), t('users.col.email'), t('users.col.role'), t('common.status'), t('users.col.active'), t('common.actions')].map(h => (
                <th key={h} style={tableHeaderCell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const roleCfg = roleColors[u.role] ?? { bg: C.pageBg, color: C.textMid }
              const isMe = u.id === currentUser?.id
              return (
                <tr key={u.id} style={{ background: isMe ? '#EEF2FF' : C.white }}>
                  <td style={tableCell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.navy, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0, fontFamily: F.en }}>
                        {(u.full_name ?? u.email ?? '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: C.textDark, fontFamily: F.en }}>{u.full_name ?? '—'} {isMe && <span style={{ fontSize: 11, color: C.textLight }}>(you)</span>}</p>
                        {u.full_name_ar && <p style={{ fontSize: 11, color: C.textLight, margin: '2px 0 0', direction: 'rtl', fontFamily: F.ar }}>{u.full_name_ar}</p>}
                      </div>
                    </div>
                  </td>
                  <td style={tableCell}>{u.email}</td>
                  <td style={tableCell}>
                    <span style={{ background: roleCfg.bg, color: roleCfg.color, padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>
                      {u.role === 'admin' ? (lang === 'ar' ? 'مشرف' : 'Admin') : u.role === 'manager' ? (lang === 'ar' ? 'مدير' : 'Manager') : u.role === 'technician' ? (lang === 'ar' ? 'فني' : 'Technician') : (lang === 'ar' ? 'مقدم طلب' : 'Requester')}
                    </span>
                  </td>
                  <td style={tableCell}>
                    <span style={{ background: u.is_active !== false ? '#DCFCE7' : C.pageBg, color: u.is_active !== false ? C.success : C.textMid, padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>
                      {u.is_active !== false ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td style={tableCell}>
                    {u.last_sign_in_at ? format(new Date(u.last_sign_in_at), 'dd MMM yyyy') : '—'}
                  </td>
                  <td style={tableCell}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {currentUser?.role === 'admin' && !isMe && (
                        <>
                          <Link href={'/dashboard/users/' + u.id + '/edit'}>
                            <button style={{ ...secondaryBtn, padding: '4px 10px', fontSize: 11 }}>{t('common.edit')}</button>
                          </Link>
                          <button onClick={() => toggleActive(u.id, u.is_active !== false)} style={{ ...secondaryBtn, padding: '4px 10px', fontSize: 11 }}>
                            {u.is_active !== false ? t('common.deactivate') : t('common.activate')}
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
  )
}
