import os

# ── 1. Vendor Invoice Add UI ──
# Read current vendor detail page and add invoice form
with open('src/app/dashboard/vendors/[id]/page.tsx', 'r', encoding='utf-8') as f:
    vendor_detail = f.read()

# Add invoice state variables
old_state = "  const [activeTab, setActiveTab] = useState<'details' | 'workorders' | 'invoices'>('details')"
new_state = """  const [activeTab, setActiveTab] = useState<'details' | 'workorders' | 'invoices'>('details')
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({ invoice_number: '', amount: '', description: '', invoice_date: '', work_order_id: '' })
  const [savingInvoice, setSavingInvoice] = useState(false)
  const [workOrders, setWorkOrders] = useState<any[]>([])"""

if old_state in vendor_detail:
    vendor_detail = vendor_detail.replace(old_state, new_state)
    print('Invoice state added')
else:
    print('State pattern not found')

# Add fetchWorkOrders to useEffect
old_effect = "  useEffect(() => { fetchAll() }, [id])"
new_effect = """  useEffect(() => { fetchAll(); fetchVendorWOs() }, [id])"""

if old_effect in vendor_detail:
    vendor_detail = vendor_detail.replace(old_effect, new_effect)
    print('useEffect updated')
else:
    print('useEffect pattern not found')

# Add fetchVendorWOs and saveInvoice functions
old_tab_style = "  const tabStyle ="
new_functions = """  async function fetchVendorWOs() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('work_orders').select('id, title').eq('organisation_id', profile.organisation_id).eq('assigned_vendor_id', id as string).order('created_at', { ascending: false })
    if (data) setWorkOrders(data)
  }

  async function saveInvoice(e: React.FormEvent) {
    e.preventDefault()
    setSavingInvoice(true)
    const { error } = await supabase.from('vendor_invoices').insert({
      vendor_id: id,
      invoice_number: invoiceForm.invoice_number,
      amount: parseFloat(invoiceForm.amount),
      description: invoiceForm.description || null,
      invoice_date: invoiceForm.invoice_date || null,
      work_order_id: invoiceForm.work_order_id || null,
      status: 'pending',
    })
    if (!error) {
      setInvoiceForm({ invoice_number: '', amount: '', description: '', invoice_date: '', work_order_id: '' })
      setShowInvoiceForm(false)
      fetchAll()
    }
    setSavingInvoice(false)
  }

  const tabStyle ="""

if old_tab_style in vendor_detail:
    vendor_detail = vendor_detail.replace(old_tab_style, new_functions)
    print('Invoice functions added')
else:
    print('tabStyle pattern not found')

# Add Add Invoice button and form to invoices tab
old_invoices_tab = "        {activeTab === 'invoices' && ("
new_invoices_tab = """        {activeTab === 'invoices' && ("""

# Find the invoices tab content and add the form
old_invoice_content = """        {activeTab === 'invoices' && (
          <div>
            {invoices.length === 0 ? (
              <p style={{ fontSize: 13, color: '#999' }}>No invoices yet.</p>
            ) : ("""

new_invoice_content = """        {activeTab === 'invoices' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
              <button onClick={() => setShowInvoiceForm(!showInvoiceForm)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                {showInvoiceForm ? 'Cancel' : '+ Add Invoice'}
              </button>
            </div>

            {showInvoiceForm && (
              <form onSubmit={saveInvoice} style={{ background: '#f9f9f9', borderRadius: 10, padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>New Invoice</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Invoice Number *</label>
                    <input value={invoiceForm.invoice_number} onChange={e => setInvoiceForm(p => ({ ...p, invoice_number: e.target.value }))} required placeholder='INV-2024-001' style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' as const }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Amount (SAR) *</label>
                    <input type='number' value={invoiceForm.amount} onChange={e => setInvoiceForm(p => ({ ...p, amount: e.target.value }))} required placeholder='0.00' min='0' step='0.01' style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' as const }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Invoice Date</label>
                    <input type='date' value={invoiceForm.invoice_date} onChange={e => setInvoiceForm(p => ({ ...p, invoice_date: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' as const }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Linked Work Order</label>
                    <select value={invoiceForm.work_order_id} onChange={e => setInvoiceForm(p => ({ ...p, work_order_id: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, background: 'white', boxSizing: 'border-box' as const }}>
                      <option value=''>None</option>
                      {workOrders.map(wo => <option key={wo.id} value={wo.id}>{wo.title}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Description</label>
                  <input value={invoiceForm.description} onChange={e => setInvoiceForm(p => ({ ...p, description: e.target.value }))} placeholder='e.g. HVAC service — 3 units' style={{ width: '100%', padding: '8px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' as const }} />
                </div>
                <button type='submit' disabled={savingInvoice} style={{ padding: '9px', background: '#2e7d32', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: savingInvoice ? 0.7 : 1 }}>
                  {savingInvoice ? 'Saving...' : 'Save Invoice'}
                </button>
              </form>
            )}

            {invoices.length === 0 ? (
              <p style={{ fontSize: 13, color: '#999' }}>No invoices yet. Click Add Invoice to record one.</p>
            ) : ("""

if old_invoice_content in vendor_detail:
    vendor_detail = vendor_detail.replace(old_invoice_content, new_invoice_content)
    print('Invoice form added to vendor detail')
else:
    print('Invoice content pattern not found - checking...')
    idx = vendor_detail.find("activeTab === 'invoices'")
    print(repr(vendor_detail[idx:idx+200]))

with open('src/app/dashboard/vendors/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(vendor_detail)
print('Vendor detail updated')

# ── 2. PM History per Asset ──
with open('src/app/dashboard/assets/[id]/page.tsx', 'r', encoding='utf-8') as f:
    asset_detail = f.read()

# Add pm history state
old_asset_state = "  const [activeTab, setActiveTab] = useState<'details' | 'workorders' | 'pm' | 'photos' | 'qr' | 'custom'>('details')"
new_asset_state = """  const [activeTab, setActiveTab] = useState<'details' | 'workorders' | 'pm' | 'photos' | 'qr' | 'custom' | 'pmhistory'>('details')
  const [pmHistory, setPmHistory] = useState<any[]>([])"""

if old_asset_state in asset_detail:
    asset_detail = asset_detail.replace(old_asset_state, new_asset_state)
    print('PM history state added')
else:
    print('Asset state pattern not found')

# Add fetch pm history to fetchAll
old_fetch = "    const [{ data: assetData }, { data: wos }, { data: pms }] = await Promise.all(["
new_fetch = """    const [{ data: assetData }, { data: wos }, { data: pms }, { data: pmh }] = await Promise.all(["""

if old_fetch in asset_detail:
    asset_detail = asset_detail.replace(old_fetch, new_fetch)
    print('Promise.all destructuring updated')
else:
    print('Promise.all pattern not found')
    idx = asset_detail.find('Promise.all')
    print(repr(asset_detail[idx:idx+300]))

# Add pm_tasks fetch to Promise.all
old_pm_fetch = "      supabase.from('pm_schedules').select('*, assignee:assigned_to(full_name)').eq('asset_id', id),"
new_pm_fetch = """      supabase.from('pm_schedules').select('*, assignee:assigned_to(full_name)').eq('asset_id', id),
      supabase.from('pm_tasks').select('*, schedule:schedule_id(title, frequency), technician:assigned_to(full_name)').eq('asset_id', id as string).order('created_at', { ascending: false }).limit(50),"""

if old_pm_fetch in asset_detail:
    asset_detail = asset_detail.replace(old_pm_fetch, new_pm_fetch)
    print('PM history fetch added')
else:
    print('PM fetch pattern not found')

# Set pm history data
old_set_pms = "    if (pms) setPmSchedules(pms)"
new_set_pms = """    if (pms) setPmSchedules(pms)
    if (pmh) setPmHistory(pmh)"""

if old_set_pms in asset_detail:
    asset_detail = asset_detail.replace(old_set_pms, new_set_pms)
    print('setPmHistory added')
else:
    print('setPmSchedules pattern not found')

# Add PM History tab button
old_qr_tab = "        <button style={tabStyle(activeTab === 'qr')} onClick={() => setActiveTab('qr')}>QR Code</button>"
new_qr_tab = """        <button style={tabStyle(activeTab === 'qr')} onClick={() => setActiveTab('qr')}>QR Code</button>
        <button style={tabStyle(activeTab === 'pmhistory')} onClick={() => setActiveTab('pmhistory')}>PM History ({pmHistory.length})</button>"""

if old_qr_tab in asset_detail:
    asset_detail = asset_detail.replace(old_qr_tab, new_qr_tab)
    print('PM History tab button added')
else:
    print('QR tab button pattern not found')

# Add PM History tab content
old_custom_tab = "      {activeTab === 'custom' && ("
new_pmhistory_tab = """      {activeTab === 'pmhistory' && (
        <div>
          <p style={{ fontSize: 13, color: '#666', marginBottom: '1rem' }}>All completed preventive maintenance tasks for this asset.</p>
          {pmHistory.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No PM history yet. PMs will appear here once completed.</p>
          ) : (
            <div style={{ border: '1px solid #eee', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                    {['Task','Schedule','Technician','Status','Due Date','Completed'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pmHistory.map((pm: any, i: number) => (
                    <tr key={pm.id} style={{ borderBottom: '1px solid #f5f5f5', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 500 }}>{pm.title ?? pm.schedule?.title ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: '#666' }}>{pm.schedule?.frequency ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: '#666' }}>{pm.technician?.full_name ?? 'Unassigned'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ background: pm.status === 'completed' ? '#e8f5e9' : pm.status === 'overdue' ? '#fce4ec' : '#fff8e1', color: pm.status === 'completed' ? '#2e7d32' : pm.status === 'overdue' ? '#b71c1c' : '#f57f17', padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 500 }}>
                          {pm.status?.replace('_', ' ').replace(/\\b\\w/g, (l: string) => l.toUpperCase()) ?? '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: '#666' }}>{pm.due_date ? new Date(pm.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: '#666' }}>{pm.completed_at ? new Date(pm.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'custom' && ("""

if old_custom_tab in asset_detail:
    asset_detail = asset_detail.replace(old_custom_tab, new_pmhistory_tab)
    print('PM History tab content added')
else:
    print('Custom tab pattern not found')

with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(asset_detail)
print('Asset detail updated with PM History tab')
print('All final features written successfully')