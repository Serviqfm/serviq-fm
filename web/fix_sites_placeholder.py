with open('src/app/dashboard/sites/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix missing curly braces around placeholder
old = "placeholder=lang === 'ar' ? '\u0627\u0644\u0628\u062d\u062b \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0627\u0644\u0645\u062f\u064a\u0646\u0629 \u0623\u0648 \u0627\u0644\u0639\u0646\u0648\u0627\u0646...' : 'Search by name, city, or address...'"
new = "placeholder={lang === 'ar' ? '\u0627\u0644\u0628\u062d\u062b...' : 'Search by name, city, or address...'}"

if old in content:
    content = content.replace(old, new)
    print('Placeholder fixed')
else:
    # Find and fix any placeholder= without curly braces
    import re
    content = re.sub(
        r"placeholder=lang === 'ar' \? '[^']*' : '[^']*'",
        lambda m: 'placeholder={' + m.group()[len('placeholder='):] + '}',
        content
    )
    print('Placeholder fixed with regex')

with open('src/app/dashboard/sites/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Saved')