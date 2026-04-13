with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the footer section and add toggle
idx = content.find('borderTop')
print('Footer context:')
print(repr(content[idx:idx+500]))

# Add language toggle before the user info in footer
old_footer = "        {!collapsed && ("
new_footer = """        <div style={{ marginBottom: 8, paddingLeft: collapsed ? 0 : 0, display: 'flex', justifyContent: 'center' }}>
          <LanguageToggle minimal />
        </div>
        {!collapsed && ("""

if old_footer in content:
    # Only replace the last occurrence (footer)
    last_idx = content.rfind(old_footer)
    content = content[:last_idx] + content[last_idx:].replace(old_footer, new_footer, 1)
    print('Toggle added to footer')
else:
    print('Footer pattern not found')

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')