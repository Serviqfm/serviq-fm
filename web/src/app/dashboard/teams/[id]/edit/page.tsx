'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

export default function EditTeamPage() {
  const router = useRouter()
  const params = useParams()
  const id = typeof params.id === 'string' ? params.id : params.id?.[0] || ''
  const { t, lang } = useLanguage()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
  useEffect(() => { loadData() }, [id])

  async function loadData() {
    if (!id) { setError('No team ID provided'); setLoading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setError('Failed to load user profile'); setLoading(false); return }
    setOrgId(profile.organisation_id)

    const [teamResult, membersResult, usersResult] = await Promise.all([
      supabase.from('teams').select('*').eq('id', id).single(),
      supabase.from('team_members').select('user_id').eq('team_id', id),
      supabase.from('users').select('id, full_name, full_name_ar, role')
        .eq('organisation_id', profile.organisation_id)
        .in('role', ['technician', 'manager'])
        .order('full_name', { ascending: true }),
    ])

    if (teamResult.error || !teamResult.data) {
      setError(lang === 'ar' ? 'لم يتم العثور على الفريق' : 'Team not found')
      setLoading(false)
      return
    }

    const team = teamResult.data
    setForm({
      name: team.name ?? '',
      name_ar: team.name_ar ?? '',
      description: team.description ?? '',
    })
    if (membersResult.data) setMemberIds(membersResult.data.map(m => m.user_id))
    if (usersResult.data) setOrgUsers(usersResult.data)
    setLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function toggleMember(userId: string) {
    setMemberIds(prev => prev.includes(userId) ? prev.filter(uid => uid !== userId) : [...prev, userId])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const { error: teamErr } = await supabase
      .from('teams')
      .update({
        name: form.name.trim(),
        name_ar: form.name_ar.trim() ? form.name_ar.trim() : null,
        description: form.description.trim() ? form.description.trim() : null,
      })
      .eq('id', id)

    if (teamErr) {
      setError(teamErr.message || (lang === 'ar' ? 'تعذر تحديث الفريق' : 'Failed to update team'))
      setSaving(false)
      return
    }

    // Sync members: delete-then-insert keeps it simple and idempotent.
    const { error: delErr } = await supabase.from('team_members').delete().eq('team_id', id)
    if (delErr) {
      setError(lang === 'ar' ? 'تعذر تحديث أعضاء الفريق' : 'Failed to update team members')
      setSaving(false)
      return
    }
    if (memberIds.length > 0) {
      const { error: memberErr } = await supabase.from('team_members').insert(
        memberIds.map(userId => ({ team_id: id, user_id: userId, organisation_id: orgId }))
      )
      if (memberErr) {
        setError(lang === 'ar' ? 'تعذر تحديث أعضاء الفريق' : 'Failed to update team members')
        setSaving(false)
        return
      }
    }

    router.push('/dashboard/teams')
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[680px] mx-auto space-y-6">
        <div>
          <a href="/dashboard/teams" className="text-on-surface-variant text-sm hover:text-primary transition-colors">{t('common.back')}</a>
          <h1 className="text-2xl font-bold text-on-surface mt-2">{lang === 'ar' ? 'تعديل الفريق' : 'Edit Team'}</h1>
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

            <div className="flex gap-2.5">
              <button type="submit" disabled={saving}
                className="flex-1 bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed">
                {saving ? t('common.saving') : (lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
              </button>
              <a href="/dashboard/teams" className="flex-1">
                <button type="button"
                  className="w-full border border-outline-variant text-on-surface-variant py-3 rounded-xl font-semibold text-sm hover:bg-surface-container-low transition-colors">
                  {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
