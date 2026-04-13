with open('src/app/dashboard/assets/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Direct byte-level replacement
old1 = "label: t('assets.status.active')"
new1 = "label: lang === 'ar' ? 'نشط' : 'Active'"

old2 = "label: t('assets.status.under_maintenance')"
new2 = "label: lang === 'ar' ? 'تحت الصيانة' : 'Under Maintenance'"

old3 = "label: t('assets.status.retired')"
new3 = "label: lang === 'ar' ? 'متقاعد' : 'Retired'"

print('Found active:', old1 in content)
print('Found under_maintenance:', old2 in content)
print('Found retired:', old3 in content)

content = content.replace(old1, new1)
content = content.replace(old2, new2)
content = content.replace(old3, new3)

print('After fix - has t assets.status:', "t('assets.status" in content)

with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')