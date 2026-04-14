import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { i18n, setLocale } from '../i18n'

type LangContextType = {
  lang: 'ar' | 'en'
  isRTL: boolean
  setLang: (lang: 'ar' | 'en') => void
  t: (key: string) => string
}

const LangContext = createContext<LangContextType>({
  lang: 'en', isRTL: false, setLang: () => {}, t: (k) => k,
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<'ar' | 'en'>('en')

  useEffect(() => {
    AsyncStorage.getItem('serviq_lang').then(saved => {
      if (saved === 'ar' || saved === 'en') {
        setLangState(saved)
        setLocale(saved)
      }
    })
  }, [])

  function setLang(l: 'ar' | 'en') {
    setLangState(l)
    setLocale(l)
  }

  function t(key: string) {
    return i18n.t(key)
  }

  return (
    <LangContext.Provider value={{ lang, isRTL: lang === 'ar', setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export const useLang = () => useContext(LangContext)