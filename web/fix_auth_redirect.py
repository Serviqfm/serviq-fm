import os

pages_to_fix = [
    'src/app/dashboard/users/page.tsx',
    'src/app/dashboard/inventory/page.tsx',
    'src/app/dashboard/sites/page.tsx',
    'src/app/dashboard/vendors/page.tsx',
    'src/app/dashboard/inspections/page.tsx',
    'src/app/dashboard/pm-schedules/page.tsx',
    'src/app/dashboard/assets/page.tsx',
    'src/app/dashboard/work-orders/page.tsx',
    'src/app/dashboard/page.tsx',
]

for path in pages_to_fix:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Add useRouter import if not present
        if 'useRouter' not in content and 'next/navigation' in content:
            content = content.replace(
                "from 'next/navigation'",
                "from 'next/navigation'"
            )

        # Fix the pattern where user not found just returns with no redirect
        # Pattern: if (!user) return
        old_no_user = "    if (!user) return\n    const { data: profile }"
        new_no_user = """    if (!user) {
      setLoading(false)
      if (typeof window !== 'undefined') window.location.href = '/login'
      return
    }
    const { data: profile }"""

        if old_no_user in content:
            content = content.replace(old_no_user, new_no_user)
            print(f'Fixed auth redirect in: {path}')

        # Also fix if profile not found
        old_no_profile = "    if (!profile) return"
        new_no_profile = """    if (!profile) {
      setLoading(false)
      return
    }"""

        content = content.replace(old_no_profile, new_no_profile)

        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

    except FileNotFoundError:
        print(f'Not found: {path}')

print('Auth redirect fixes applied')