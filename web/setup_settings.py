import os

# ── 1. Create Settings page ──
os.makedirs('src/app/dashboard/settings', exist_ok=True)

settings_content = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

export default function SettingsPage() {
  const [org, setOrg] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'organisation' | 'storage' | 'account'>('organisation')
  const supabase = createClient()
  const { t, lang, setLang } = useLanguage()

  const [form, setForm] = useState({
    name: '', name_ar: '', vat_number: '', cr_number: '',
    phone: '', address: '', city: '', country: 'Saudi Arabia',
    vertical: '', timezone: 'Asia/Riyadh',
  })

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
  const planConfig: Record<string, { label: string; color: string; price: string }> = {
    small:      { label: lang === 'ar' ? 'صغير' : 'Small',       color: '#1a1a2e', price: 'SAR 2,000-3,000/yr' },
    medium:     { label: lang === 'ar' ? 'متوسط' : 'Medium',     color: '#283593', price: 'SAR 5,000-7,000/yr' },
    enterprise: { label: lang === 'ar' ? 'مؤسسي' : 'Enterprise', color: '#b71c1c', price: 'SAR 12,000-15,000/yr' },
  }
  const planInfo = planConfig[plan] ?? planConfig.small

  const inputStyle = { width: '100%', padding: '9px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const }
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 500 as const, color: '#444', marginBottom: 6 }
  const sectionStyle = { background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }

  if (loading) return <div style={{ padding: '2rem', color: '#999' }}>{t('common.loading')}</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 0.5rem' }}>
        {lang === 'ar' ? 'الإعدادات' : 'Settings'}
      </h1>
      <p style={{ fontSize: 13, color: '#999', margin: '0 0 2rem' }}>
        {lang === 'ar' ? 'إدارة إعدادات مؤسستك وحسابك' : 'Manage your organisation and account settings'}
      </p>

      <div style={{ display: 'flex', gap: 0, marginBottom: '2rem', borderBottom: '2px solid #eee' }}>
        {([
          { key: 'organisation', label: lang === 'ar' ? 'المؤسسة' : 'Organisation' },
          { key: 'storage',      label: lang === 'ar' ? 'التخزين' : 'Storage' },
          { key: 'account',      label: lang === 'ar' ? 'الحساب' : 'Account' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? '#1a1a2e' : '#666',
              borderBottom: activeTab === tab.key ? '2px solid #1a1a2e' : '2px solid transparent',
              marginBottom: -2 }}>
            {tab.label}
          </button>
        ))}
      </div>

      {saved && (
        <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem', color: '#2e7d32', fontSize: 14 }}>
          {lang === 'ar' ? 'تم الحفظ بنجاح' : 'Saved successfully'}
        </div>
      )}

      {activeTab === 'organisation' && (
        <div>
          <div style={sectionStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 1.25rem' }}>
              {lang === 'ar' ? 'معلومات المؤسسة' : 'Organisation Information'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>{lang === 'ar' ? 'الاسم (إنجليزي) *' : 'Name (English) *'}</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder='e.g. Al Noor School' />
              </div>
              <div>
                <label style={labelStyle}>{lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                <input style={{ ...inputStyle, direction: 'rtl' }} value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} placeholder='مثال: مدرسة النور' />
              </div>
              <div>
                <label style={labelStyle}>{lang === 'ar' ? 'الرقم الضريبي' : 'VAT Number'}</label>
                <input style={inputStyle} value={form.vat_number} onChange={e => setForm(f => ({ ...f, vat_number: e.target.value }))} placeholder='300000000000003' />
              </div>
              <div>
                <label style={labelStyle}>{lang === 'ar' ? 'رقم السجل التجاري' : 'CR Number'}</label>
                <input style={inputStyle} value={form.cr_number} onChange={e => setForm(f => ({ ...f, cr_number: e.target.value }))} placeholder='1010000000' />
              </div>
              <div>
                <label style={labelStyle}>{lang === 'ar' ? 'الهاتف' : 'Phone'}</label>
                <input style={inputStyle} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder='+966 50 000 0000' />
              </div>
              <div>
                <label style={labelStyle}>{lang === 'ar' ? 'المدينة' : 'City'}</label>
                <input style={inputStyle} value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder='Riyadh' />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>{lang === 'ar' ? 'العنوان' : 'Address'}</label>
                <input style={inputStyle} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder='King Fahd Road, Al Olaya District' />
              </div>
              <div>
                <label style={labelStyle}>{lang === 'ar' ? 'القطاع' : 'Vertical'}</label>
                <select style={inputStyle} value={form.vertical} onChange={e => setForm(f => ({ ...f, vertical: e.target.value }))}>
                  <option value=''>{lang === 'ar' ? 'اختر القطاع' : 'Select vertical'}</option>
                  <option value='school'>{lang === 'ar' ? 'مدرسة' : 'School'}</option>
                  <option value='retail'>{lang === 'ar' ? 'تجزئة' : 'Retail'}</option>
                  <option value='compound'>{lang === 'ar' ? 'مجمع سكني' : 'Compound'}</option>
                  <option value='hotel'>{lang === 'ar' ? 'فندق' : 'Hotel'}</option>
                  <option value='other'>{lang === 'ar' ? 'أخرى' : 'Other'}</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>{lang === 'ar' ? 'المنطقة الزمنية' : 'Timezone'}</label>
                <select style={inputStyle} value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
                  <option value='Asia/Riyadh'>Asia/Riyadh (UTC+3)</option>
                  <option value='Asia/Dubai'>Asia/Dubai (UTC+4)</option>
                  <option value='Asia/Kuwait'>Asia/Kuwait (UTC+3)</option>
                  <option value='Asia/Bahrain'>Asia/Bahrain (UTC+3)</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={saveOrg} disabled={saving}
                style={{ background: '#1a1a2e', color: 'white', padding: '10px 28px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 14 }}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 1rem' }}>
              {lang === 'ar' ? 'خطة الاشتراك' : 'Subscription Plan'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9f9f9', borderRadius: 10, padding: '1rem 1.25rem' }}>
              <div>
                <span style={{ background: planInfo.color, color: 'white', padding: '4px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>{planInfo.label}</span>
                <p style={{ fontSize: 13, color: '#666', margin: '8px 0 0' }}>{planInfo.price}</p>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>{lang === 'ar' ? 'للترقية تواصل معنا' : 'To upgrade, contact us'}</p>
                <a href='mailto:support@serviqfm.com' style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 500 }}>support@serviqfm.com</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'storage' && (
        <div>
          <div style={sectionStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 1rem' }}>
              {lang === 'ar' ? 'سياسة التخزين' : 'Storage Policy'}
            </h3>
            <div style={{ background: '#e3f2fd', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#0d47a1', margin: '0 0 6px' }}>
                {lang === 'ar' ? 'الاحتفاظ القياسي: 6 أشهر' : 'Standard Retention: 6 Months'}
              </p>
              <p style={{ fontSize: 13, color: '#1565c0', margin: 0 }}>
                {lang === 'ar'
                  ? 'يتم حذف الصور ومقاطع الفيديو تلقائياً بعد 6 أشهر. البيانات الهيكلية محفوظة بشكل دائم.'
                  : 'Images and videos are automatically purged after 6 months. Structured data is retained permanently.'}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.5rem' }}>
              {[
                { icon: '✅', title: lang === 'ar' ? 'البيانات الهيكلية' : 'Structured Data', desc: lang === 'ar' ? 'أوامر العمل والأصول وسجلات الصيانة محفوظة دائماً' : 'Work orders, assets and PM logs retained permanently' },
                { icon: '📷', title: lang === 'ar' ? 'الصور والفيديو' : 'Images & Video', desc: lang === 'ar' ? 'تُحذف بعد 6 أشهر. يمكن التحميل قبل الحذف.' : 'Purged after 6 months. Export before purge date.' },
                { icon: '🔔', title: lang === 'ar' ? 'إشعار مسبق' : 'Advance Notice', desc: lang === 'ar' ? 'إشعار بريد إلكتروني قبل 30 يوماً من الحذف' : 'Email notification 30 days before any purge' },
                { icon: '📦', title: lang === 'ar' ? 'تصدير البيانات' : 'Data Export', desc: lang === 'ar' ? 'تحميل جميع الملفات في أي وقت' : 'Download all media files at any time' },
              ].map(item => (
                <div key={item.title} style={{ background: '#f9f9f9', borderRadius: 10, padding: '1rem' }}>
                  <p style={{ fontSize: 20, margin: '0 0 6px' }}>{item.icon}</p>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>{item.title}</p>
                  <p style={{ fontSize: 12, color: '#666', margin: 0 }}>{item.desc}</p>
                </div>
              ))}
            </div>
            <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 1rem' }}>
              {lang === 'ar' ? 'إضافات التخزين الممتد' : 'Extended Storage Add-Ons'}
            </h4>
            {[
              { period: lang === 'ar' ? '12 شهراً' : '12 months', price: 'SAR 600/yr', best: lang === 'ar' ? 'للمدارس' : 'Best for Schools' },
              { period: lang === 'ar' ? '24 شهراً' : '24 months', price: 'SAR 1,200/yr', best: lang === 'ar' ? 'للتجزئة' : 'Best for Retail' },
              { period: lang === 'ar' ? 'غير محدود' : 'Unlimited',  price: 'SAR 2,400/yr', best: lang === 'ar' ? 'للفنادق والمجمعات' : 'Best for Hotels & Compounds' },
            ].map(addon => (
              <div key={addon.price} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid #eee', borderRadius: 10, marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 2px' }}>{addon.period}</p>
                  <p style={{ fontSize: 12, color: '#999', margin: 0 }}>{addon.best}</p>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', margin: '0 0 4px' }}>{addon.price}</p>
                  <a href='mailto:support@serviqfm.com' style={{ fontSize: 12, color: '#1a1a2e' }}>
                    {lang === 'ar' ? 'تواصل للاشتراك' : 'Contact to subscribe'}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'account' && (
        <div>
          <div style={sectionStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 1.25rem' }}>
              {lang === 'ar' ? 'تفضيلات اللغة' : 'Language Preference'}
            </h3>
            <div style={{ display: 'flex', gap: 12 }}>
              {(['ar', 'en'] as const).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  style={{ padding: '10px 24px', borderRadius: 8,
                    border: lang === l ? 'none' : '1px solid #ddd',
                    background: lang === l ? '#1a1a2e' : 'white',
                    color: lang === l ? 'white' : '#333',
                    cursor: 'pointer', fontSize: 14, fontWeight: lang === l ? 600 : 400 }}>
                  {l === 'ar' ? 'العربية' : 'English'}
                </button>
              ))}
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 1rem' }}>
              {lang === 'ar' ? 'معلومات الحساب' : 'Account Information'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: lang === 'ar' ? 'الاسم' : 'Name', value: user?.full_name ?? '-' },
                { label: lang === 'ar' ? 'البريد الإلكتروني' : 'Email', value: user?.email ?? '-' },
                { label: lang === 'ar' ? 'الدور' : 'Role', value: user?.role ?? '-' },
                { label: lang === 'ar' ? 'المؤسسة' : 'Organisation', value: org?.name ?? '-' },
              ].map(item => (
                <div key={item.label} style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px 14px' }}>
                  <p style={{ fontSize: 11, color: '#999', margin: '0 0 4px', fontWeight: 500 }}>{item.label}</p>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={sectionStyle}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 0.5rem' }}>
              {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
            </h3>
            <p style={{ fontSize: 13, color: '#999', margin: '0 0 1rem' }}>
              {lang === 'ar' ? 'سيتم تسجيل خروجك من جميع الأجهزة' : 'You will be signed out of all devices'}
            </p>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
              style={{ padding: '10px 24px', borderRadius: 8, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
              {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}"""

with open('src/app/dashboard/settings/page.tsx', 'w', encoding='utf-8') as f:
    f.write(settings_content)
print('Settings page created')

# ── 2. Add Settings to Sidebar ──
with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    sidebar = f.read()

# Find the navItems array and add settings
old_nav = "{ key: 'U', href: '/dashboard/users', labelEn: 'Users', labelAr: '\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646' },"
new_nav = """{ key: 'U', href: '/dashboard/users', labelEn: 'Users', labelAr: '\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646' },
  { key: '\u2699', href: '/dashboard/settings', labelEn: 'Settings', labelAr: '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a' },"""

if old_nav in sidebar:
    sidebar = sidebar.replace(old_nav, new_nav)
    print('Settings added to sidebar nav')
else:
    # Try alternate pattern
    idx = sidebar.find("'users'")
    if idx == -1:
        idx = sidebar.find('/dashboard/users')
    print('Nav pattern not found, context:', repr(sidebar[idx-30:idx+150]))

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(sidebar)
print('Sidebar updated')