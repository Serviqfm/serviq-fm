with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = "{ label: t('nav.users'),       href: '/dashboard/users',              icon: 'U', badge: '',     exact: false },"
new = """{ label: t('nav.users'),       href: '/dashboard/users',              icon: 'U', badge: '',     exact: false },
    { label: t('nav.settings'),    href: '/dashboard/settings',           icon: '\u2699', badge: '',     exact: false },"""

if old in content:
    content = content.replace(old, new)
    print('Settings added to nav')
else:
    print('Pattern not found')

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

# Add translation keys
with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    ctx = f.read()

if "'nav.settings'" not in ctx:
    ctx = ctx.replace(
        "  'nav.users':",
        "  'nav.settings': 'Settings',\n  'nav.users':"
    )
    ctx = ctx.replace(
        "  'nav.users': '\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646',",
        "  'nav.settings': '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a',\n  'nav.users': '\u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645\u0648\u0646',"
    )
    with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
        f.write(ctx)
    print('Translation keys added')

print('Done')