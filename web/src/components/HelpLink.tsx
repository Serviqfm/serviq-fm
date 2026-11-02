'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { moduleForPath } from '@/lib/help-paths'

// Contextual "?" that deep-links the current module page to its Help Center guide.
export default function HelpLink() {
  const pathname = usePathname()
  const { lang } = useLanguage()
  const key = moduleForPath(pathname)
  if (!key) return null
  const label = lang === 'ar' ? 'دليل هذه الصفحة' : 'Guide for this page'
  return (
    <Link href={`/dashboard/help/${key}`} title={label} aria-label={label}
      className="fixed bottom-5 end-5 z-40 w-10 h-10 rounded-full bg-white border border-outline-variant/40 shadow-md flex items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary transition-colors">
      <span className="material-symbols-outlined text-xl">question_mark</span>
    </Link>
  )
}
