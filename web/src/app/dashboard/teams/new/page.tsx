'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

export default function NewTeamPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [orgId, setOrgId] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orgUsers, setOrgUsers] = useState<any[]>([])
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [form, setForm] = useState({
    name: '',
    name_ar: '',
    description: '',
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    setOrgId(profile.organisation_id)
    const { data: userData } = await supabase
      .from('users')
      .select('id, full_name, full_name_ar, role')
      .eq('organisation_id', profile.organisation_id)
      .in('role', ['technician', 'manager'])
      .order('full_name', { ascending: true })
    if (userData) setOrgUsers(userData)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function toggleMember(userId: string) {
    setMemberIds(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    if (!orgId) { setError(lang === 'ar' ? 'لم يتم العثور على المؤسسة' : 'Organisation not found'); setLoading(false); return }

    const { data: team, error: teamErr } = await supabase
      .from('teams')
      .insert({
        organisation_id: orgId,
        name: form.name.trim(),
        name_ar: form.name_ar.trim() ? form.name_ar.trim() : null,
        description: form.description.trim() ? form.description.trim() : null,
      })
      .select()
      .single()

    if (teamErr || !team) {
      setError(teamErr?.message ?? (lang === 'ar' ? 'تعذر إنشاء الفريق' : 'Failed to create team'))
      setLoading(false)
      return
    }

    if (memberIds.length > 0) {
      const { error: memberErr } = await supabase.from('team_members').insert(
        memberIds.map(userId => ({ team_id: team.id, user_id: userId, organisation_id: orgId }))
      )
      if (memberErr) {
        setError(lang === 'ar' ? 'تم إنشاء الفريق لكن تعذر إضافة بعض الأعضاء' : 'Team created, but adding members failed')
        setLoading(false)
        return
      }
    }

    router.push('/dashboard/teams')
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[680px] mx-auto space-y-6">
        <div>
          <a href="/dashboard/teams" className="text-on-surface-variant text-sm hover:text-primary transition-colors">{t('common.back')}</a>
          <h1 className="text-2xl font-bold text-on-surface mt-2">{lang === 'ar' ? 'إنشاء فريق' : 'Create Team'}</h1>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelCls}>
                {lang === 'ar' ? 'اسم الفريق (إنجليزي)' : 'Team Name (English)'}
                <span className="text-error"> *</span>
              </label>
              <input name="name" value={form.name} onChange={handleChange} required
                placeholder={lang === 'ar' ? 'مثال: فريق التكييف' : 'e.g. HVAC Crew'} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>{lang === 'ar' ? 'اسم الفريق (عربي)' : 'Team Name (Arabic)'}</label>
              <input name="name_ar" value={form.name_ar} onChange={handleChange} dir="rtl"
                placeholder={lang === 'ar' ? 'مثال: فريق التكييف' : 'e.g. فريق التكييف'} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>{lang === 'ar' ? 'الوصف' : 'Description'}</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={3}
                placeholder={lang === 'ar' ? 'ما الذي يتولاه هذا الفريق؟' : 'What does this team handle?'} className={inputCls + ' resize-vertical'} />
            </div>

            <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4">
              <label className={labelCls}>
                {lang === 'ar' ? 'الأعضاء' : 'Members'}
                <span className="font-normal text-on-surface-variant ml-2 normal-case tracking-normal">
                  ({memberIds.length} {lang === 'ar' ? 'محدد' : 'selected'})
                </span>
              </label>
              {orgUsers.length === 0 && (
                <p className="text-xs text-on-surface-variant">
                  {lang === 'ar' ? 'لا يوجد فنيون أو مديرون في مؤسستك بعد.' : 'No technicians or managers in your organisation yet.'}
                </p>
              )}
              <div className="max-h-60 overflow-y-auto space-y-1">
                {orgUsers.map(u => (
                  <label key={u.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-container cursor-pointer">
                    <input
                      type="checkbox"
                      checked={memberIds.includes(u.id)}
                      onChange={() => toggleMember(u.id)}
                      className="w-4 h-4 rounded border border-outline-variant text-primary cursor-pointer"
                    />
                    <span className="text-sm text-on-surface">
                      {lang === 'ar' && u.full_name_ar ? u.full_name_ar : u.full_name}
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {u.role === 'manager' ? (lang === 'ar' ? 'مدير' : 'Manager') : (lang === 'ar' ? 'فني' : 'Technician')}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-error text-sm">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? t('common.saving') : (lang === 'ar' ? 'إنشاء الفريق' : 'Create Team')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
