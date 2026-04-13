import re

files = [
    'src/app/dashboard/assets/new/page.tsx',
    'src/app/dashboard/assets/[id]/page.tsx',
    'src/app/dashboard/work-orders/new/page.tsx',
    'src/app/dashboard/pm-schedules/new/page.tsx',
    'src/app/dashboard/inventory/new/page.tsx',
    'src/app/dashboard/vendors/new/page.tsx',
    'src/app/dashboard/users/new/page.tsx',
    'src/app/dashboard/inspections/new/page.tsx',
    'src/app/dashboard/sites/new/page.tsx',
]

for filepath in files:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original = content
        
        # Fix nested ternaries like: {lang === 'ar' ? 'Arabic' : {lang === 'ar' ? 'Arabic' : 'English'}}
        # Pattern: lang === 'ar' ? X : {lang === 'ar' ? X : Y} -> lang === 'ar' ? X : Y
        nested = re.findall(r"lang === 'ar' \? '([^']+)' : \{lang === 'ar' \? '[^']+' : '([^']+)'\}", content)
        if nested:
            print(f'{filepath}: Found {len(nested)} nested ternaries')
            
        content = re.sub(
            r"lang === 'ar' \? '([^']+)' : \{lang === 'ar' \? '[^']+' : '([^']+)'\}",
            r"lang === 'ar' ? '\1' : '\2'",
            content
        )
        
        # Also fix double-wrapped JSX like: >{lang === 'ar' ? 'X' : {lang === 'ar' ? 'X' : 'Y'}}
        content = re.sub(
            r">\{lang === 'ar' \? '([^']+)' : \{lang === 'ar' \? '[^']+' : '([^']+)'\}\}<",
            r">{lang === 'ar' ? '\1' : '\2'}<",
            content
        )
        
        # Fix asset [id] page - the Record<string,string> issue
        if '[id]' in filepath:
            content = content.replace(
                'useState<Record<string,string>>({})',
                'useState<Record<string, string>>({})'
            )
            print(f'Fixed Record type in {filepath}')
        
        if content != original:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f'Fixed: {filepath}')
        else:
            print(f'No changes: {filepath}')
            
    except FileNotFoundError:
        print(f'Not found: {filepath}')

print('Done')