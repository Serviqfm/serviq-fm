with open('src/app/dashboard/vendors/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = """activeTab === 'invoices' && (
        <div>
          {invoices.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No invoices recorded for this vendor yet.</p>
          ) : ("""

new = """activeTab === 'invoices' && (
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

if old in content:
    content = content.replace(old, new)
    print('Invoice button and form added successfully')
else:
    print('Pattern not found')

with open('src/app/dashboard/vendors/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)