# Fix hydration error in LanguageContext
# The issue is useState initializer reads localStorage on client
# but server renders with default 'en'
# Solution: use useEffect to apply language, not useState initializer

with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the problematic useState initializer with simple default
# and apply language in useEffect instead
old_init = """  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en'
    try {
      const cookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('serviq_lang='))?.split('=')[1]
      const stored = cookie || localStorage.getItem('serviq_lang')
      return (stored === 'ar' || stored === 'en') ? stored as Language : 'en'
    } catch { return 'en' }
  })"""

new_init = "  const [lang, setLangState] = useState<Language>('en')"

if old_init in content:
    content = content.replace(old_init, new_init)
    print('Initializer simplified')
else:
    print('Init pattern not found - checking current state:')
    idx = content.find('useState<Language>')
    print(repr(content[idx-5:idx+200]))

# Replace useEffect to properly load from storage
old_effect = """  useEffect(() => {
    // Apply dir/lang on mount based on current state
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])"""

new_effect = """  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const cookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('serviq_lang='))?.split('=')[1] as Language
      const stored = cookie || localStorage.getItem('serviq_lang') as Language
      if (stored === 'ar' || stored === 'en') {
        setLangState(stored)
        document.documentElement.dir = stored === 'ar' ? 'rtl' : 'ltr'
        document.documentElement.lang = stored
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (mounted) {
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
      document.documentElement.lang = lang
    }
  }, [lang, mounted])"""

if old_effect in content:
    content = content.replace(old_effect, new_effect)
    print('useEffect updated with mounted flag')
else:
    print('Effect pattern not found')
    idx = content.find('useEffect')
    print(repr(content[idx:idx+200]))

# Update the context value to include mounted
old_provider = """  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL: lang === 'ar' }}>
      {children}
    </LanguageContext.Provider>
  )"""

new_provider = """  // Prevent hydration mismatch by using suppressHydrationWarning
  // Return English on server, correct language on client after mount
  const effectiveLang = mounted ? lang : 'en'

  function tEffective(key: string): string {
    const translations = effectiveLang === 'ar' ? ar : en
    return translations[key] ?? en[key] ?? key
  }

  return (
    <LanguageContext.Provider value={{ lang: effectiveLang, setLang, t: tEffective, isRTL: effectiveLang === 'ar' }}>
      {children}
    </LanguageContext.Provider>
  )"""

if old_provider in content:
    content = content.replace(old_provider, new_provider)
    print('Provider updated with effectiveLang')
else:
    print('Provider pattern not found')
    idx = content.find('LanguageContext.Provider')
    print(repr(content[idx-10:idx+200]))

with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Hydration fix complete')