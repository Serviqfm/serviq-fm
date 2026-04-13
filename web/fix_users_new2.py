with open('src/app/dashboard/users/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = """    // Create user record — they will complete signup via invite link
    const { error: insertError } = await supabase.from('users').insert({
      email: form.email,
      full_name: form.full_name,
      full_name_ar: form.full_name_ar || null,
      role: form.role,
      phone: form.phone || null,
      organisation_id: orgId,
      is_active: true,
      invited_at: new Date().toISOString(),
    })"""

new = """    // Generate a placeholder UUID — replaced when user completes signup
    const placeholderId = crypto.randomUUID()

    // Create user record — they will complete signup via invite link
    const { error: insertError } = await supabase.from('users').insert({
      id: placeholderId,
      email: form.email,
      full_name: form.full_name,
      full_name_ar: form.full_name_ar || null,
      role: form.role,
      phone: form.phone || null,
      organisation_id: orgId,
      is_active: true,
      invited_at: new Date().toISOString(),
    })"""

if old in content:
    content = content.replace(old, new)
    print('Fixed')
else:
    print('Pattern not found')

with open('src/app/dashboard/users/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')