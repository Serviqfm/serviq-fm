with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('LanguageToggle')
print(repr(content[idx-200:idx+200]))
