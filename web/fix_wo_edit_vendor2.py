with open('src/app/dashboard/work-orders/[id]/edit/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = """Promise.all([
      supabase.from('work_orders').select('*').eq('id', id).single(),
      supabase.from('assets').select('id, name').eq('organisation_id', orgId).eq('status', 'active'),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
    ])"""

new = """Promise.all([
      supabase.from('work_orders').select('*').eq('id', id).single(),
      supabase.from('assets').select('id, name').eq('organisation_id', orgId).eq('status', 'active'),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
      supabase.from('vendors').select('id, company_name').eq('organisation_id', orgId).eq('is_active', true),
    ])"""

old2 = "const [{ data: wo }, { data: assetData }, { data: siteData }, { data: techData }] = await"
new2 = "const [{ data: wo }, { data: assetData }, { data: siteData }, { data: techData }, { data: vendorData }] = await"

if old in content:
    content = content.replace(old, new)
    print('Promise.all fixed')
else:
    print('Pattern still not found')

if old2 in content:
    content = content.replace(old2, new2)
    print('Destructuring fixed')
else:
    print('Destructuring already fixed or not found')

with open('src/app/dashboard/work-orders/[id]/edit/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')