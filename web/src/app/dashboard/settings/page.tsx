'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import NotificationsTab from './NotificationsTab'
import PushAuditTab from './PushAuditTab'
import FormFieldsTab from './FormFieldsTab'

export default function SettingsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [org, setOrg] = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'organisation' | 'storage' | 'account' | 'notifications' | 'push_audit' | 'form_fields'>('organisation')
  const supabase = createClient()
  const { t, lang, setLang } = useLanguage()

  const [form, setForm] = useState({
    name: '', name_ar: '', vat_number: '', cr_number: '',
    phone: '', address: '', city: '', country: 'Saudi Arabia',
    vertical: '', timezone: 'Asia/Riyadh',
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) { setLoading(false); return }
    const { data: profile } = await supabase.from('users')
      .select('*, organisation:organisation_id(*)')
      .eq('id', authUser.id).single()
    if (profile) {
      setUser(profile)
      setOrg(profile.organisation)
      setForm({
        name: profile.organisation?.name ?? '',
        name_ar: profile.organisation?.name_ar ?? '',
        vat_number: profile.organisation?.vat_number ?? '',
        cr_number: profile.organisation?.cr_number ?? '',
        phone: profile.organisation?.phone ?? '',
        address: profile.organisation?.address ?? '',
        city: profile.organisation?.city ?? '',
        country: profile.organisation?.country ?? 'Saudi Arabia',
        vertical: profile.organisation?.vertical ?? '',
        timezone: profile.organisation?.timezone ?? 'Asia/Riyadh',
      })
    }
    setLoading(false)
  }

  async function saveOrg() {
    if (!org) return
    setSaving(true)
    await supabase.from('organisations').update({
      name: form.name, name_ar: form.name_ar,
      vat_number: form.vat_number, cr_number: form.cr_number,
      phone: form.phone, address: form.address,
      city: form.city, country: form.country,
      vertical: form.vertical, timezone: form.timezone,
      updated_at: new Date().toISOString(),
    }).eq('id', org.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const plan = org?.plan_tier ?? 'small'
  const planConfig: Record<string, { label: string; badgeClass: string; price: string }> = {
    small:      { label: lang === 'ar' ? 'صغير' : 'Small',       badgeClass: 'bg-primary text-on-primary',   price: 'SAR 2,000-3,000/yr' },
    medium:     { label: lang === 'ar' ? 'متوسط' : 'Medium',     badgeClass: 'bg-primary text-on-primary',   price: 'SAR 5,000-7,000/yr' },
    enterprise: { label: lang === 'ar' ? 'مؤسسي' : 'Enterprise', badgeClass: 'bg-error text-white',          price: 'SAR 12,000-15,000/yr' },
  }
  const planInfo = planConfig[plan] ?? planConfig.small

  if (loading) return <div className="p-8 text-on-surface-variant">{t('common.loading')}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[800px] mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface mb-2">
            {lang === 'ar' ? 'الإعدادات' : 'Settings'}
          </h1>
          <p className="text-sm text-on-surface-variant mb-8">
            {lang === 'ar' ? 'إدارة إعدادات مؤسستك وحسابك' : 'Manage your organisation and account settings'}
          </p>

          <div className="flex gap-0 mb-8 border-b border-outline-variant">
            {(() => {
              const tabs: { key: 'organisation' | 'storage' | 'account' | 'notifications' | 'push_audit' | 'form_fields'; label: string }[] = [
                { key: 'organisation',   label: lang === 'ar' ? 'المؤسسة' : 'Organisation' },
                { key: 'storage',        label: lang === 'ar' ? 'التخزين' : 'Storage' },
                { key: 'account',        label: lang === 'ar' ? 'الحساب' : 'Account' },
                { key: 'notifications',  label: lang === 'ar' ? 'الإشعارات' : 'Notifications' },
                { key: 'push_audit',     label: lang === 'ar' ? 'تدقيق الرسائل' : 'Push Audit' },
              ]
              if (user?.role === 'admin') {
                tabs.push({ key: 'form_fields', label: lang === 'ar' ? 'حقول النماذج' : 'Form Fields' })
              }
              return tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={activeTab === tab.key
                    ? 'px-4 py-2.5 text-sm font-semibold border-b-2 border-primary text-primary'
                    : 'px-4 py-2.5 text-sm text-on-surface-variant border-b-2 border-transparent hover:text-on-surface transition-colors'}
                >
                  {tab.label}
                </button>
              ))
            })()}
          </div>

          {saved && (
            <div className="bg-primary/10 border border-primary/20 rounded-[10px] px-4 py-3 mb-6 text-primary text-sm">
              {lang === 'ar' ? 'تم الحفظ بنجاح' : 'Saved successfully'}
            </div>
          )}

          {activeTab === 'organisation' && (
            <div className="space-y-6">
              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
                <h3 className="text-base font-semibold text-on-surface mb-5">
                  {lang === 'ar' ? 'معلومات المؤسسة' : 'Organisation Information'}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'الاسم (إنجليزي) *' : 'Name (English) *'}
                    </label>
                    <input
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Al Noor School"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}
                    </label>
                    <input
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      style={{ direction: 'rtl' }}
                      value={form.name_ar}
                      onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
                      placeholder="مثال: مدرسة النور"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'الرقم الضريبي' : 'VAT Number'}
                    </label>
                    <input
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={form.vat_number}
                      onChange={e => setForm(f => ({ ...f, vat_number: e.target.value }))}
                      placeholder="300000000000003"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'رقم السجل التجاري' : 'CR Number'}
                    </label>
                    <input
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={form.cr_number}
                      onChange={e => setForm(f => ({ ...f, cr_number: e.target.value }))}
                      placeholder="1010000000"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'الهاتف' : 'Phone'}
                    </label>
                    <input
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="+966 50 000 0000"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'المدينة' : 'City'}
                    </label>
                    <input
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={form.city}
                      onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                      placeholder="Riyadh"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'العنوان' : 'Address'}
                    </label>
                    <input
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={form.address}
                      onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                      placeholder="King Fahd Road, Al Olaya District"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'القطاع' : 'Vertical'}
                    </label>
                    <select
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={form.vertical}
                      onChange={e => setForm(f => ({ ...f, vertical: e.target.value }))}
                    >
                      <option value="">{lang === 'ar' ? 'اختر القطاع' : 'Select vertical'}</option>
                      <option value="school">{lang === 'ar' ? 'مدرسة' : 'School'}</option>
                      <option value="retail">{lang === 'ar' ? 'تجزئة' : 'Retail'}</option>
                      <option value="compound">{lang === 'ar' ? 'مجمع سكني' : 'Compound'}</option>
                      <option value="hotel">{lang === 'ar' ? 'فندق' : 'Hotel'}</option>
                      <option value="other">{lang === 'ar' ? 'أخرى' : 'Other'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">
                      {lang === 'ar' ? 'المنطقة الزمنية' : 'Timezone'}
                    </label>
                    <select
                      className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={form.timezone}
                      onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}
                    >
                      <option value="Asia/Riyadh">Asia/Riyadh (UTC+3)</option>
                      <option value="Asia/Dubai">Asia/Dubai (UTC+4)</option>
                      <option value="Asia/Kuwait">Asia/Kuwait (UTC+3)</option>
                      <option value="Asia/Bahrain">Asia/Bahrain (UTC+3)</option>
                    </select>
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={saveOrg}
                    disabled={saving}
                    className={`bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors${saving ? ' opacity-70' : ''}`}
                  >
                    {saving ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
                <h3 className="text-base font-semibold text-on-surface mb-4">
                  {lang === 'ar' ? 'خطة الاشتراك' : 'Subscription Plan'}
                </h3>
                <div className="flex items-center justify-between bg-surface-container-low rounded-[10px] px-5 py-4">
                  <div>
                    <span className={`${planInfo.badgeClass} px-4 py-1 rounded-full text-sm font-semibold`}>
                      {planInfo.label}
                    </span>
                    <p className="text-sm text-on-surface-variant mt-2">{planInfo.price}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-on-surface-variant mb-1">
                      {lang === 'ar' ? 'للترقية تواصل معنا' : 'To upgrade, contact us'}
                    </p>
                    <a href="mailto:support@serviqfm.com" className="text-sm text-primary font-medium">
                      support@serviqfm.com
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="space-y-6">
              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
                <h3 className="text-base font-semibold text-on-surface mb-4">
                  {lang === 'ar' ? 'سياسة التخزين' : 'Storage Policy'}
                </h3>
                <div className="bg-[#e3f2fd] rounded-[10px] px-5 py-4 mb-5">
                  <p className="text-sm font-semibold text-[#0d47a1] mb-1.5">
                    {lang === 'ar' ? 'الاحتفاظ القياسي: 6 أشهر' : 'Standard Retention: 6 Months'}
                  </p>
                  <p className="text-sm text-[#1565c0]">
                    {lang === 'ar'
                      ? 'يتم حذف الصور ومقاطع الفيديو تلقائياً بعد 6 أشهر. البيانات الهيكلية محفوظة بشكل دائم.'
                      : 'Images and videos are automatically purged after 6 months. Structured data is retained permanently.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {[
                    { icon: '✅', title: lang === 'ar' ? 'البيانات الهيكلية' : 'Structured Data', desc: lang === 'ar' ? 'أوامر العمل والأصول وسجلات الصيانة محفوظة دائماً' : 'Work orders, assets and PM logs retained permanently' },
                    { icon: '📷', title: lang === 'ar' ? 'الصور والفيديو' : 'Images & Video', desc: lang === 'ar' ? 'تُحذف بعد 6 أشهر. يمكن التحميل قبل الحذف.' : 'Purged after 6 months. Export before purge date.' },
                    { icon: '🔔', title: lang === 'ar' ? 'إشعار مسبق' : 'Advance Notice', desc: lang === 'ar' ? 'إشعار بريد إلكتروني قبل 30 يوماً من الحذف' : 'Email notification 30 days before any purge' },
                    { icon: '📦', title: lang === 'ar' ? 'تصدير البيانات' : 'Data Export', desc: lang === 'ar' ? 'تحميل جميع الملفات في أي وقت' : 'Download all media files at any time' },
                  ].map(item => (
                    <div key={item.title} className="bg-surface-container-low rounded-[10px] p-4">
                      <p className="text-xl mb-1.5">{item.icon}</p>
                      <p className="text-sm font-semibold text-on-surface mb-1">{item.title}</p>
                      <p className="text-xs text-on-surface-variant">{item.desc}</p>
                    </div>
                  ))}
                </div>
                <h4 className="text-sm font-semibold text-on-surface mb-4">
                  {lang === 'ar' ? 'إضافات التخزين الممتد' : 'Extended Storage Add-Ons'}
                </h4>
                {[
                  { period: lang === 'ar' ? '12 شهراً' : '12 months', price: 'SAR 600/yr',    best: lang === 'ar' ? 'للمدارس' : 'Best for Schools' },
                  { period: lang === 'ar' ? '24 شهراً' : '24 months', price: 'SAR 1,200/yr',  best: lang === 'ar' ? 'للتجزئة' : 'Best for Retail' },
                  { period: lang === 'ar' ? 'غير محدود' : 'Unlimited', price: 'SAR 2,400/yr', best: lang === 'ar' ? 'للفنادق والمجمعات' : 'Best for Hotels & Compounds' },
                ].map(addon => (
                  <div key={addon.price} className="flex justify-between items-center px-4 py-3 border border-outline-variant rounded-[10px] mb-2">
                    <div>
                      <p className="text-sm font-medium text-on-surface mb-0.5">{addon.period}</p>
                      <p className="text-xs text-on-surface-variant">{addon.best}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary mb-1">{addon.price}</p>
                      <a href="mailto:support@serviqfm.com" className="text-xs text-primary">
                        {lang === 'ar' ? 'تواصل للاشتراك' : 'Contact to subscribe'}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-6">
              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
                <h3 className="text-base font-semibold text-on-surface mb-5">
                  {lang === 'ar' ? 'تفضيلات اللغة' : 'Language Preference'}
                </h3>
                <div className="flex gap-3">
                  {(['ar', 'en'] as const).map(l => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={lang === l
                        ? 'px-6 py-2.5 rounded-lg bg-primary text-on-primary font-semibold text-sm'
                        : 'px-6 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant text-sm hover:bg-surface-container-low transition-colors'}
                    >
                      {l === 'ar' ? 'العربية' : 'English'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
                <h3 className="text-base font-semibold text-on-surface mb-4">
                  {lang === 'ar' ? 'معلومات الحساب' : 'Account Information'}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: lang === 'ar' ? 'الاسم' : 'Name',                     value: user?.full_name ?? '-' },
                    { label: lang === 'ar' ? 'البريد الإلكتروني' : 'Email',         value: user?.email ?? '-' },
                    { label: lang === 'ar' ? 'الدور' : 'Role',                     value: user?.role ?? '-' },
                    { label: lang === 'ar' ? 'المؤسسة' : 'Organisation',           value: org?.name ?? '-' },
                  ].map(item => (
                    <div key={item.label} className="bg-surface-container-low rounded-lg px-3.5 py-3">
                      <p className="text-[11px] text-on-surface-variant font-medium mb-1">{item.label}</p>
                      <p className="text-sm font-medium text-on-surface">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
                <h3 className="text-base font-semibold text-on-surface mb-2">
                  {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
                </h3>
                <p className="text-sm text-on-surface-variant mb-4">
                  {lang === 'ar' ? 'سيتم تسجيل خروجك من جميع الأجهزة' : 'You will be signed out of all devices'}
                </p>
                <button
                  onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
                  className="bg-error/10 text-error border border-error/20 px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-error/20 transition-colors"
                >
                  {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <NotificationsTab />
          )}

          {activeTab === 'push_audit' && (
            <PushAuditTab />
          )}

          {activeTab === 'form_fields' && user?.role === 'admin' && (
            <FormFieldsTab />
          )}
        </div>
      </div>
    </div>
  )
}
