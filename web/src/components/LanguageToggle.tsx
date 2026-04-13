'use client'

import { useLanguage } from '@/context/LanguageContext'

export default function LanguageToggle({ minimal = false }: { minimal?: boolean }) {
  const { lang, setLang } = useLanguage()

  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: minimal ? '4px 10px' : '6px 14px',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(255,255,255,0.1)',
        color: 'white',
        cursor: 'pointer',
        fontSize: minimal ? 11 : 12,
        fontWeight: 500,
        letterSpacing: 0.3,
      }}
      title={lang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
    >
      <span style={{ fontSize: minimal ? 14 : 16 }}>{lang === 'en' ? '🇸🇦' : '🇬🇧'}</span>
      <span>{lang === 'en' ? 'العربية' : 'English'}</span>
    </button>
  )
}