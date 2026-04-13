with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix: initialize state synchronously from cookie/localStorage
old_state = "  const [lang, setLangState] = useState<Language>('en')"
new_state = """  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en'
    const cookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('serviq_lang='))?.split('=')[1]
    const stored = cookie || localStorage.getItem('serviq_lang')
    return (stored === 'ar' || stored === 'en') ? stored as Language : 'en'
  })"""

if old_state in content:
    content = content.replace(old_state, new_state)
    print('State initializer fixed')
else:
    print('Pattern not found')
    idx = content.find('useState<Language>')
    print(repr(content[idx-10:idx+60]))

# Also apply dir/lang on initial render via useEffect with no delay
old_effect = """  useEffect(() => {
    // Check cookie first, then localStorage
    const cookieLang = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('serviq_lang='))?.split('=')[1] as Language
    const stored = cookieLang || localStorage.getItem('serviq_lang') as Language
    if (stored === 'ar' || stored === 'en') {
      setLangState(stored)
      document.documentElement.dir = stored === 'ar' ? 'rtl' : 'ltr'
      document.documentElement.lang = stored
    }
  }, [])"""

new_effect = """  useEffect(() => {
    // Apply dir/lang on mount based on current state
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])"""

if old_effect in content:
    content = content.replace(old_effect, new_effect)
    print('Effect simplified')
else:
    print('Effect pattern not found')

with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')