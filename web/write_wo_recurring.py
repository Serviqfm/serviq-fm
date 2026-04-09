with open('src/app/dashboard/work-orders/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add is_recurring and recurrence_frequency to form state
old_form = """    title: '',
    description: '',
    priority: 'medium',
    category: '',
    site_id: '',
    asset_id: '',
    assigned_to: '',
    due_at: '',
    sla_hours: '',"""

new_form = """    title: '',
    description: '',
    priority: 'medium',
    category: '',
    site_id: '',
    asset_id: '',
    assigned_to: '',
    due_at: '',
    sla_hours: '',
    is_recurring: 'false',
    recurrence_frequency: 'monthly',"""

content = content.replace(old_form, new_form)

# Add recurring fields to the insert
old_insert = """      source: 'manual',
      photo_urls: photoUrls,"""

new_insert = """      source: form.is_recurring === 'true' ? 'recurring' : 'manual',
      photo_urls: photoUrls,"""

content = content.replace(old_insert, new_insert)

# Add recurring UI before the photos section
old_photos = """        <div>
          <label style={labelStyle}>
            Photos (up to 8)"""

new_photos = """        <div style={{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: 8, padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <input
              type='checkbox'
              id='is_recurring'
              checked={form.is_recurring === 'true'}
              onChange={e => setForm(prev => ({ ...prev, is_recurring: e.target.checked ? 'true' : 'false' }))}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor='is_recurring' style={{ fontSize: 13, fontWeight: 500, color: '#444', cursor: 'pointer' }}>
              Recurring work order
            </label>
          </div>
          {form.is_recurring === 'true' && (
            <div>
              <p style={{ fontSize: 12, color: '#999', margin: '0 0 8px' }}>This work order will be linked to a PM schedule. Select the recurrence frequency:</p>
              <select name='recurrence_frequency' value={form.recurrence_frequency} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, background: 'white' }}>
                <option value='daily'>Daily</option>
                <option value='weekly'>Weekly</option>
                <option value='monthly'>Monthly</option>
                <option value='quarterly'>Quarterly</option>
                <option value='biannual'>Every 6 Months</option>
                <option value='annual'>Annual</option>
              </select>
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>
            Photos (up to 8)"""

content = content.replace(old_photos, new_photos)

with open('src/app/dashboard/work-orders/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Recurring work orders added')
print('Has is_recurring:', 'is_recurring' in content)
