import os

for filepath in [
    'src/app/dashboard/work-orders/new/page.tsx',
    'src/app/dashboard/work-orders/[id]/edit/page.tsx',
]:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add vendors state
    content = content.replace(
        "  const [technicians, setTechnicians] = useState<any[]>([])",
        "  const [technicians, setTechnicians] = useState<any[]>([])\n  const [vendors, setVendors] = useState<any[]>([])"
    )

    # Add vendor fetch to loadFormData
    content = content.replace(
        "      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),",
        "      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),\n      supabase.from('vendors').select('id, company_name').eq('organisation_id', orgId).eq('is_active', true),"
    )

    # Add vendor data setter after technicians
    content = content.replace(
        "    if (techData) setTechnicians(techData)",
        "    if (techData) setTechnicians(techData)\n    if (vendorData) setVendors(vendorData)"
    )

    # Fix the Promise.all destructuring to include vendorData
    content = content.replace(
        "    const [{ data: assetData }, { data: siteData }, { data: techData }] = await Promise.all([",
        "    const [{ data: assetData }, { data: siteData }, { data: techData }, { data: vendorData }] = await Promise.all(["
    )

    # Update Assign To dropdown to include vendors
    content = content.replace(
        """          <select name='assigned_to' value={form.assigned_to} onChange={handleChange} style={fieldStyle}>
              <option value=''>Unassigned</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>""",
        """          <select name='assigned_to' value={form.assigned_to} onChange={handleChange} style={fieldStyle}>
              <option value=''>Unassigned</option>
              {technicians.length > 0 && <optgroup label='Internal Technicians'>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </optgroup>}
              {vendors.length > 0 && <optgroup label='External Vendors'>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.company_name}</option>)}
              </optgroup>}
            </select>"""
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Updated: {filepath}')
    print(f'  Has vendors state: {"vendors" in content}')
