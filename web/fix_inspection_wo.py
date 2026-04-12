with open('src/app/dashboard/inspections/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = """    const items = selectedTemplate.items ?? []
    const failedItems = items.filter((item: any) => {
      const resp = responses[item.id]
      return item.type === 'pass_fail' && (resp === 'fail' || resp === false)
    })

    const overallResult = failedItems.length === 0 ? 'pass' : failedItems.length === items.filter((i: any) => i.type === 'pass_fail').length ? 'fail' : 'partial'"""

new = """    const items = selectedTemplate.items ?? []
    const failedItems = items.filter((item: any) => {
      const resp = responses[item.id]
      return item.type === 'pass_fail' && resp === 'fail'
    })

    const passfailItems = items.filter((i: any) => i.type === 'pass_fail')
    const overallResult = failedItems.length === 0 ? 'pass' : failedItems.length === passfailItems.length ? 'fail' : 'partial'"""

if old in content:
    content = content.replace(old, new)
    print('Logic fixed')
else:
    print('Pattern not found - checking what is there')
    idx = content.find('failedItems')
    print(repr(content[idx-100:idx+300]))

# Also fix the WO creation to use correct user id
old2 = """    // Auto-create WOs for failed items
    for (const item of failedItems) {
      await supabase.from('work_orders').insert({
        title: 'Inspection Fail: ' + item.label,
        description: 'Auto-created from inspection: ' + selectedTemplate.name,
        priority: 'high',
        status: 'new',
        source: 'inspection',
        site_id: siteId || null,
        asset_id: assetId || null,
        organisation_id: orgId,
        created_by: userId,
      })
    }"""

new2 = """    // Auto-create WOs for failed items
    for (const item of failedItems) {
      const { error: woError } = await supabase.from('work_orders').insert({
        title: 'Inspection Fail: ' + item.label,
        description: 'Auto-created from failed inspection: ' + selectedTemplate.name + '. Item: ' + item.label,
        priority: 'high',
        status: 'new',
        source: 'inspection',
        site_id: siteId || null,
        asset_id: assetId || null,
        organisation_id: orgId,
        created_by: userId,
      })
      if (woError) console.error('WO creation error:', woError)
    }"""

if old2 in content:
    content = content.replace(old2, new2)
    print('WO creation fixed')
else:
    print('WO creation pattern not found')

with open('src/app/dashboard/inspections/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('File saved')