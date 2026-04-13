'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const supabase = createClient()
  const { t } = useLanguage()

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (!profile) return
    setCurrentUser(profile)
    if (!['admin', 'manager'].includes(profile.role)) return
    const { data } = await supabase.from('users').select('*').eq('organisation_id', profile.organisation_id).order('full_name', { ascending: true })
    if (data) setUsers(data)
    setLoading(false)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('users').update({ is_active: !current, updated_at: new Date().toISOString() }).eq('id', id)
    fetchUsers()
  }

  const roleColors: Record<string, { bg: string; color: string }> = {
    admin:      { bg: '#1a1a2e', color: 'white' },
    manager:    { bg: '#e8eaf6', color: '#283593' },
    technician: { bg: '#e8f5e9', color: '#2e7d32' },
    requester:  { bg: '#fff8e1', color: '#f57f17' },
  }

  const roleCount = (role: string) => users.filter(u => u.role === role).length

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('users.title')}</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{users.length} users in your organisation</p>
        </div>
        {currentUser?.role === 'admin' && (
          <Link href='/dashboard/users/new'>
            <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>{t('btn.add_user')}</button>
          </Link>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
        {['admin','manager','technician','requester'].map(role => {
          const cfg = roleColors[role]
          return (
            <div key={role} style={{ background: 'white', border: '1px solid #eee', borderRadius: 10, padding: '1rem' }}>
              <p style={{ fontSize: 12, color: '#999', margin: '0 0 6px', fontWeight: 500 }}>{role.charAt(0).toUpperCase() + role.slice(1)}s</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 700, color: '#1a1a2e' }}>{roleCount(role)}</span>
                <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500 }}>{role}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              {[t('users.col.name'),t('users.col.email'),t('users.col.role'),'Status',t('users.col.active'),'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const roleCfg = roleColors[u.role] ?? { bg: '#f5f5f5', color: '#666' }
              const isMe = u.id === currentUser?.id
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0', background: isMe ? '#f0f7ff' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#1a1a2e', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                        {(u.full_name ?? u.email ?? '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{u.full_name ?? '—'} {isMe && <span style={{ fontSize: 11, color: '#999' }}>(you)</span>}</p>
                        {u.full_name_ar && <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0', direction: 'rtl' }}>{u.full_name_ar}</p>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{u.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: roleCfg.bg, color: roleCfg.color, padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                      {u.role?.charAt(0).toUpperCase() + u.role?.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: u.is_active !== false ? '#e8f5e9' : '#f5f5f5', color: u.is_active !== false ? '#2e7d32' : '#999', padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                      {u.is_active !== false ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>
                    {u.last_sign_in_at ? format(new Date(u.last_sign_in_at), 'dd MMM yyyy') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {currentUser?.role === 'admin' && !isMe && (
                        <>
                          <Link href={'/dashboard/users/' + u.id + '/edit'}>
                            <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>{t('common.edit')}</button>
                          </Link>
                          <button
                            onClick={() => toggleActive(u.id, u.is_active !== false)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11, color: '#666' }}
                          >
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