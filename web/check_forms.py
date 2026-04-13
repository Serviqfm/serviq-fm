forms = [
    'src/app/dashboard/work-orders/new/page.tsx',
    'src/app/dashboard/assets/new/page.tsx',
    'src/app/dashboard/pm-schedules/new/page.tsx',
    'src/app/dashboard/inventory/new/page.tsx',
    'src/app/dashboard/vendors/new/page.tsx',
    'src/app/dashboard/users/new/page.tsx',
    'src/app/dashboard/inspections/new/page.tsx',
    'src/app/dashboard/inspections/templates/new/page.tsx',
]

for path in forms:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        has_lang = 'useLanguage' in content
        name = path.split('/')[-2]
        print(f'{"OK" if has_lang else "MISSING"} | {name}')
    except FileNotFoundError:
        print(f'NOT FOUND | {path}')