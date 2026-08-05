'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

export default function NewCostCenterPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [orgId, setOrgId] = useState('')
  const [allowed, setAllowed] = useState(false)
  const [ready, setReady] = useState(false)
  const [form, setForm] = useState({ name: '', name_ar: '', code: '', annual_budget: '' })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile) return
    setOrgId(profile.organisation_id)
    setAllowed(['admin', 'manager'].includes(profile.role))
    setReady(true)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    if (!orgId) { setError(lang === 'ar' ? 'لم يتم العثور على المؤسسة' : 'Organisation not found'); setLoading(false); return }
    const budget = parseFloat(form.annual_budget)

    const { error: err } = await supabase.from('cost_centers').insert({
      organisation_id: orgId,
      name: form.name.trim(),
      name_ar: form.name_ar.trim() ? form.name_ar.trim() : null,
      code: form.code.trim() ? form.code.trim() : null,
      annual_budget: isNaN(budget) || budget < 0 ? 0 : budget,
    })

    if (err) {
      setError(err.message ?? (lang === 'ar' ? 'تعذر الإنشاء' : 'Failed to create'))
      setLoading(false)
      return
    }
    router.push('/dashboard/cost-centers')
  }

  if (ready && !allowed) {
    return <div className="p-8 text-on-surface-variant">{lang === 'ar' ? 'ليس لديك صلاحية الوصول إلى هذه الصفحة.' : 'You do not have permission to access this page.'}</div>
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[680px] mx-auto space-y-6">
        <div>
          <a href="/dashboard/cost-centers" className="text-on-surface-variant text-sm hover:text-primary transition-colors">{t('common.back')}</a>
          <h1 className="text-2xl font-bold text-on-surface mt-2">{lang === 'ar' ? 'مركز تكلفة جديد' : 'New Cost Center'}</h1>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelCls}>
                {lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}
                <span className="text-error"> *</span>
              </label>
              <input name="name" value={form.name} onChange={handleChange} required
                placeholder={lang === 'ar' ? 'مثال: صيانة المبنى A' : 'e.g. Building A Maintenance'} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>{lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
              <input name="name_ar" value={form.name_ar} onChange={handleChange} dir="rtl"
                placeholder={lang === 'ar' ? 'مثال: صيانة المبنى أ' : 'e.g. صيانة المبنى أ'} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>{lang === 'ar' ? 'الرمز' : 'Code'}</label>
              <input name="code" value={form.code} onChange={handleChange}
                placeholder={lang === 'ar' ? 'مثال: CC-001' : 'e.g. CC-001'} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>{lang === 'ar' ? 'الميزانية السنوية (ريال)' : 'Annual Budget (SAR)'}</label>
              <input name="annual_budget" type="number" min="0" step="0.01" value={form.annual_budget} onChange={handleChange}
                placeholder="0.00" className={inputCls} />
            </div>

            {error && <p className="text-error text-sm">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed">
              {loading ? t('common.saving') : (lang === 'ar' ? 'إنشاء' : 'Create')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
