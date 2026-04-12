with open('src/app/dashboard/work-orders/[id]/edit/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Promise.all destructuring to include vendorData
content = content.replace(
    'const [{ data: wo }, { data: assetData }, { data: siteData }, { data: techData }] = await Promise.all([',
    'const [{ data: wo }, { data: assetData }, { data: siteData }, { data: techData }, { data: vendorData }] = await Promise.all(['
)

# Add vendor query to Promise.all - find the closing bracket after techData query
old_tech_line = "      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),\n    ])"
new_tech_line = "      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),\n      supabase.from('vendors').select('id, company_name').eq('organisation_id', orgId).eq('is_active', true),\n    ])"

if old_tech_line in content:
    content = content.replace(old_tech_line, new_tech_line)
    print('Promise.all updated')
else:
    print('Promise.all pattern not found')
    idx = content.find('technician')
    print(repr(content[idx-100:idx+200]))

with open('src/app/dashboard/work-orders/[id]/edit/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Has vendorData:', 'vendorData' in content)
print('Has vendor query:', 'vendors' in content)