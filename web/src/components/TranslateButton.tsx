'use client'

import { useState } from 'react'

interface TranslateButtonProps {
  texts: Record<string, string>
  onTranslated: (translations: Record<string, string>) => void
  targetLang?: string
}

export default function TranslateButton({ texts, onTranslated, targetLang = 'ar' }: TranslateButtonProps) {
  const [translating, setTranslating] = useState(false)
  const [translated, setTranslated] = useState(false)

  async function translateAll() {
    setTranslating(true)
    const results: Record<string, string> = {}
    const keys = Object.keys(texts)
    for (const key of keys) {
      const text = texts[key]
      if (!text || text.trim() === '') { results[key] = text; continue }
      try {
        const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|' + targetLang
        const res = await fetch(url)
        const data = await res.json()
        results[key] = data?.responseData?.translatedText ?? text
        await new Promise(r => setTimeout(r, 100))
      } catch {
        results[key] = text
      }
    }
    onTranslated(results)
    setTranslated(true)
    setTranslating(false)
  }

  return (
    <button
      onClick={translateAll}
      disabled={translating}
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        border: '1px solid #ddd',
        background: translated ? '#e8f5e9' : 'white',
        color: translated ? '#2e7d32' : '#666',
        cursor: translating ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        opacity: translating ? 0.7 : 1,
      }}
    >
      <span>{translating ? '⟳' : '🌐'}</span>
      <span>{translating ? 'Translating...' : translated ? 'Translated to Arabic' : 'Translate to Arabic'}</span>
    </button>
  )
}