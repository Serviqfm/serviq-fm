'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

export default function TeamsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [currentUser, setCurrentUser] = useState<any>(null)
  const supabase = createClient()
  const { t, lang } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchTeams() }, [])

  async function fetchTeams() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); if (typeof window !== 'undefined') window.location.href = '/login'; return }
    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setCurrentUser(profile)
    if (!['admin', 'manager'].includes(profile.role)) { setLoading(false); return }
    const { data } = await supabase
      .from('teams')
      .select('*, team_members(count)')
      .eq('organisation_id', profile.organisation_id)
      .order('name', { ascending: true })
    if (data) setTeams(data)
    setLoading(false)
  }

  async function deleteTeam(id: string, name: string) {
    const msg = lang === 'ar'
      ? `هل أنت متأكد من حذف فريق "${name}"؟ لن يتم حذف أوامر العمل المرتبطة به.`
      : `Are you sure you want to delete the team "${name}"? Work orders linked to it will not be deleted.`
    if (!confirm(msg)) return
    const { error } = await supabase.from('teams').delete().eq('id', id)
    if (error) {
      alert(lang === 'ar' ? 'تعذر حذف الفريق' : 'Failed to delete team')
      return
    }
    fetchTeams()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberCount = (team: any) => Array.isArray(team.team_members) ? (team.team_members[0]?.count ?? 0) : 0

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  if (currentUser && !['admin', 'manager'].includes(currentUser.role)) {
    return (
      <div className="p-8 text-on-surface-variant">
        {lang === 'ar' ? 'ليس لديك صلاحية الوصول إلى هذه الصفحة.' : 'You do not have permission to access this page.'}
      </div>
    )
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-on-surface">{lang === 'ar' ? 'الفرق' : 'Teams'}</h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {teams.length} {lang === 'ar' ? 'فريق في مؤسستك' : 'team(s) in your organisation'}
            </p>
          </div>
          <Link href="/dashboard/teams/new">
            <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
              <span className="material-symbols-outlined text-lg">group_add</span>
              {lang === 'ar' ? 'إنشاء فريق' : 'Create Team'}
            </button>
          </Link>
        </div>

        {/* Table */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/30">
                  {[
                    lang === 'ar' ? 'الاسم' : 'Name',
                    lang === 'ar' ? 'الوصف' : 'Description',
                    lang === 'ar' ? 'الأعضاء' : 'Members',
                    t('common.actions'),
                  ].map(h => (
                    <th key={h} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {teams.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-sm text-on-surface-variant text-center">
                      {lang === 'ar' ? 'لا توجد فرق بعد. أنشئ فريقك الأول.' : 'No teams yet. Create your first team.'}
                    </td>
                  </tr>
                )}
                {teams.map(team => (
                  <tr key={team.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-lg">groups</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            {lang === 'ar' && team.name_ar ? team.name_ar : team.name}
                          </p>
                          {team.name_ar && lang !== 'ar' && (
                            <p className="text-xs text-on-surface-variant mt-0.5" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>{team.name_ar}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-sm text-on-surface-variant">{team.description || '—'}</td>
                    <td className="p-3 whitespace-nowrap">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                        {memberCount(team)} {lang === 'ar' ? 'عضو' : 'member(s)'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Link href={'/dashboard/teams/' + team.id + '/edit'}>
                          <button className="px-3 py-1 rounded-lg border border-outline-variant/40 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                        </Link>
                        <button onClick={() => deleteTeam(team.id, lang === 'ar' && team.name_ar ? team.name_ar : team.name)}
                          className="px-3 py-1 rounded-lg border border-error/30 text-xs font-semibold text-error hover:bg-error/5 transition-colors">
                          {lang === 'ar' ? 'حذف' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
