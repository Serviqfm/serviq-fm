'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { parseCSV, readFileText } from '@/lib/csv'
import { useLanguage } from '@/context/LanguageContext'

const TEMPLATE_HEADERS = 'email,full_name,full_name_ar,role,phone,team'
const TEMPLATE_EXAMPLE = 'ahmed@company.com,Ahmed Al-Rashidi,أحمد الراشدي,technician,+966 5x xxx xxxx,HVAC Crew'
// 1C-28: teams-only import — a CSV with `name` (no `email`) creates teams only.
const TEAMS_TEMPLATE_HEADERS = 'name,name_ar'
const TEAMS_TEMPLATE_EXAMPLE = 'HVAC Crew,فريق التكييف'

type ImportResult = { created: number; errors: string[]; warnings: string[] }

export default function UserImportPage() {
  const router = useRouter()
  const supabase = createClient()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ImportResult | null>(null)
  const [teamsMode, setTeamsMode] = useState(false)
  const [error, setError] = useState('')

  // Import is manager/admin only (the API also enforces this). Bounce others.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
      if (profile && ['admin', 'manager'].includes(profile.role ?? '')) setAllowed(true)
      else { setAllowed(false); router.replace('/dashboard/users') }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function downloadTemplate(teams = false) {
    const csv = teams
      ? TEAMS_TEMPLATE_HEADERS + '\n' + TEAMS_TEMPLATE_EXAMPLE
      : TEMPLATE_HEADERS + '\n' + TEMPLATE_EXAMPLE
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = teams ? 'serviq-fm-team-import-template.csv' : 'serviq-fm-user-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError('')
    setResults(null)
    try {
      const rows = parseCSV(await readFileText(file))
      if (rows.length === 0) {
        setError(ar ? 'الملف لا يحتوي على صفوف بيانات.' : 'The file has no data rows.')
        setLoading(false)
        e.target.value = ''
        return
      }
      setTeamsMode(!('email' in rows[0]) && 'name' in rows[0])
      const res = await fetch('/api/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data?.error ?? (ar ? 'فشل الاستيراد' : 'Import failed'))
      else setResults(data as ImportResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'فشل الاستيراد' : 'Import failed'))
    }
    setLoading(false)
    e.target.value = '' // allow re-uploading the same file after a fix
  }

  if (allowed === null) return <div style={{ padding: '2rem' }}>{ar ? 'جارٍ التحميل...' : 'Loading...'}</div>
  if (!allowed) return null

  return (
    <div style={{ padding: '2rem', maxWidth: 800, margin: '0 auto' }} dir={ar ? 'rtl' : 'ltr'}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/users' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{ar ? 'رجوع للمستخدمين' : 'Back to Users'}</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>{ar ? 'استيراد المستخدمين من CSV' : 'Import Users from CSV'}</h1>
      </div>

      <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: 14, fontWeight: 500, margin: '0 0 8px', color: '#1565c0' }}>{ar ? 'كيفية الاستيراد' : 'How to import'}</p>
        <ol style={{ margin: 0, paddingInlineStart: '1.25rem', fontSize: 13, color: '#333', lineHeight: 1.8 }}>
          <li>{ar ? 'نزّل القالب أدناه واملأ صفًا واحدًا لكل مستخدم' : 'Download the template below and fill in one row per user'}</li>
          <li>{ar ? 'الحقول المطلوبة: البريد الإلكتروني، الاسم الكامل، والدور' : <><strong>email</strong>, <strong>full_name</strong> and <strong>role</strong> are required</>}</li>
          <li>{ar ? 'الأدوار المسموحة: technician / manager / requester / admin (يمكن للمدير فقط إنشاء مدير نظام)' : <>role: technician / manager / requester / admin (only an admin can create admins)</>}</li>
          <li>{ar ? 'العمود team اختياري — سيتم إنشاء الفريق إن لم يكن موجودًا وإضافة المستخدم إليه' : <><strong>team</strong> is optional — it is created if it does not exist and the user is added to it</>}</li>
          <li>{ar ? 'يُرسَل بريد ترحيبي بكلمة مرور مؤقتة لكل مستخدم يُنشأ' : 'A welcome email with a temporary password is sent to each created user'}</li>
          <li>{ar ? 'لاستيراد الفرق فقط: ملف بعمودي name و name_ar بدون عمود email' : <>Teams only: a CSV with <strong>name</strong> and <strong>name_ar</strong> columns (no email column) creates teams without users</>}</li>
        </ol>
        <button onClick={() => downloadTemplate()} style={{ marginTop: '1rem', padding: '8px 18px', background: '#1565c0', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          {ar ? 'تنزيل قالب CSV' : 'Download CSV Template'}
        </button>
        <button onClick={() => downloadTemplate(true)} style={{ marginTop: '1rem', marginInlineStart: 8, padding: '8px 18px', background: 'white', color: '#1565c0', border: '1px solid #1565c0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
          {ar ? 'قالب الفرق فقط' : 'Teams-Only Template'}
        </button>
      </div>

      {!results ? (
        <div style={{ border: '2px dashed #ddd', borderRadius: 10, padding: '2rem', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 500, margin: '0 0 8px' }}>{ar ? 'ارفع ملف CSV' : 'Upload your CSV file'}</p>
          <p style={{ fontSize: 13, color: '#999', margin: '0 0 16px' }}>{ar ? 'اختر القالب المكتمل لبدء الاستيراد' : 'Select the completed template to begin import'}</p>
          <input type='file' accept='.csv,text/csv' onChange={handleImport} disabled={loading} style={{ fontSize: 13 }} />
          {loading && <p style={{ fontSize: 13, color: '#666', marginTop: 12 }}>{ar ? 'جارٍ استيراد المستخدمين... يرجى الانتظار' : 'Importing users... please wait'}</p>}
          {error && <p style={{ fontSize: 13, color: '#c62828', marginTop: 12 }}>{error}</p>}
        </div>
      ) : (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ background: results.created > 0 ? '#e8f5e9' : '#fff8e1', border: '1px solid ' + (results.created > 0 ? '#a5d6a7' : '#ffe082'), borderRadius: 10, padding: '1.25rem', marginBottom: '1rem' }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px', color: results.created > 0 ? '#2e7d32' : '#f57f17' }}>
              {results.created} {teamsMode
                ? (ar ? 'فريق تم إنشاؤه' : (results.created === 1 ? 'team created' : 'teams created'))
                : (ar ? 'مستخدم تم إنشاؤه' : (results.created === 1 ? 'user created' : 'users created'))}
            </p>
            {results.errors.length > 0 && <p style={{ fontSize: 13, color: '#c62828', margin: 0 }}>{results.errors.length} {ar ? 'صف به أخطاء' : (results.errors.length === 1 ? 'row had errors' : 'rows had errors')}</p>}
          </div>
          {results.warnings.length > 0 && (
            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px', color: '#f57f17' }}>{ar ? 'تحذيرات:' : 'Warnings:'}</p>
              {results.warnings.map((w, i) => <p key={i} style={{ fontSize: 12, margin: '0 0 4px', color: '#8a6d00' }}>{w}</p>)}
            </div>
          )}
          {results.errors.length > 0 && (
            <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '1rem' }}>
              <p style={{ fontSize: 13, fontWeight: 500, margin: '0 0 8px', color: '#b71c1c' }}>{ar ? 'الأخطاء:' : 'Errors:'}</p>
              {results.errors.map((err, i) => <p key={i} style={{ fontSize: 12, margin: '0 0 4px', color: '#c62828' }}>{err}</p>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: '1rem' }}>
            <a href='/dashboard/users'>
              <button style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>{ar ? 'عرض المستخدمين' : 'View Users'}</button>
            </a>
            <button onClick={() => { setResults(null); setError('') }} style={{ padding: '8px 20px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>{ar ? 'استيراد المزيد' : 'Import More'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
