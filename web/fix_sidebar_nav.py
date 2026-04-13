with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the navItems array and move it inside the component
# First check where it is
idx = content.find('const navItems')
print('navItems position:', idx)
print('Context:', repr(content[idx-50:idx+100]))