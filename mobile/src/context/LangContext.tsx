import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { i18n, setLocale } from '../i18n'
import { syncRTL } from '../lib/rtl'

type LangContextType = {
  lang: 'ar' | 'en'
  isRTL: boolean
  setLang: (lang: 'ar' | 'en') => void
  t: (key: string, options?: Record<string, unknown>) => string
}

const LangContext = createContext<LangContextType>({
  lang: 'en', isRTL: false, setLang: () => {}, t: (k) => k,
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<'ar' | 'en'>('en')

  useEffect(() => {
    AsyncStorage.getItem('serviq_lang').then(saved => {
      const l = saved === 'ar' || saved === 'en' ? saved : 'en'
      if (l !== 'en') { setLangState(l); setLocale(l) }
      // Align native RTL with the saved language on startup (reloads if it flips).
      syncRTL(l)
    })
  }, [])

  function setLang(l: 'ar' | 'en') {
    setLangState(l)
    setLocale(l)
    AsyncStorage.setItem('serviq_lang', l).catch(() => {})
    // Flip native layout direction; reloads the app when the direction changes.
    syncRTL(l)
  }

  function t(key: string, options?: Record<string, unknown>) {
    return i18n.t(key, options)
  }

  return (
    <LangContext.Provider value={{ lang, isRTL: lang === 'ar', setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export const useLang = () => useContext(LangContext)