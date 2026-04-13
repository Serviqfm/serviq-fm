with open('src/app/dashboard/vendors/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find where vendor data is set and initialize rating
old_set_vendor = "    if (v) setVendor(v)"
new_set_vendor = """    if (v) {
      setVendor(v)
      setRating(v.average_rating ?? 0)
    }"""

if old_set_vendor in content:
    content = content.replace(old_set_vendor, new_set_vendor)
    print('Rating initialization fixed')
else:
    # Try alternate pattern
    idx = content.find('setVendor(v)')
    print('setVendor pattern:', repr(content[idx-5:idx+50]))

with open('src/app/dashboard/vendors/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')