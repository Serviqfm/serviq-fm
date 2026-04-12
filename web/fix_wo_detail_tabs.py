with open('src/app/dashboard/work-orders/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add parts and activity state variables
old_state = "  const [activeTab, setActiveTab] = useState<'comments' | 'history' | 'photos'>('comments')"
new_state = """  const [activeTab, setActiveTab] = useState<'comments' | 'history' | 'photos' | 'parts' | 'activity'>('comments')
  const [inventoryItems, setInventoryItems] = useState<any[]>([])
  const [partsUsed, setPartsUsed] = useState<any[]>([])
  const [selectedPartId, setSelectedPartId] = useState('')
  const [partQty, setPartQty] = useState('')
  const [addingPart, setAddingPart] = useState(false)
  const [activityText, setActivityText] = useState('')
  const [activityType, setActivityType] = useState('update')
  const [activities, setActivities] = useState<any[]>([])
  const [addingActivity, setAddingActivity] = useState(false)"""

if old_state in content:
    content = content.replace(old_state, new_state)
    print('State variables added')
else:
    print('State pattern not found')

# 2. Add fetchInventory and fetchActivities to useEffect
old_effect = "  useEffect(() => {\n    fetchWorkOrder()\n    fetchComments()\n    fetchHistory()\n  }, [id])"
new_effect = """  useEffect(() => {
    fetchWorkOrder()
    fetchComments()
    fetchHistory()
    fetchInventory()
    fetchActivities()
  }, [id])"""

if old_effect in content:
    content = content.replace(old_effect, new_effect)
    print('useEffect updated')
else:
    print('useEffect pattern not found')

# 3. Add fetch functions before the getSLAInfo function
old_sla = "  function getSLAInfo() {"
new_functions = """  async function fetchInventory() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('inventory_items').select('id, name, unit, stock_quantity, unit_cost').eq('organisation_id', profile.organisation_id).eq('is_active', true).order('name')
    if (data) setInventoryItems(data)
  }

  async function fetchActivities() {
    const { data } = await supabase.from('work_order_comments').select('*, user:user_id(full_name)').eq('work_order_id', id).order('created_at', { ascending: false })
    if (data) setActivities(data.filter((c: any) => c.body.startsWith('[ACTIVITY]')))
  }

  async function addPart() {
    if (!selectedPartId || !partQty || parseFloat(partQty) <= 0) return
    setAddingPart(true)
    const part = inventoryItems.find(i => i.id === selectedPartId)
    if (!part) { setAddingPart(false); return }
    const qty = parseFloat(partQty)
    const newStock = Math.max(0, part.stock_quantity - qty)
    await supabase.from('inventory_items').update({ stock_quantity: newStock, updated_at: new Date().toISOString() }).eq('id', selectedPartId)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('work_order_comments').insert({
      work_order_id: id,
      user_id: user?.id,
      body: '[ACTIVITY] Parts used: ' + qty + ' x ' + part.name + ' (SAR ' + (part.unit_cost ? (qty * part.unit_cost).toFixed(2) : '—') + ')',
    })
    setPartsUsed(prev => [...prev, { name: part.name, qty, unit: part.unit, cost: part.unit_cost ? qty * part.unit_cost : null }])
    setSelectedPartId('')
    setPartQty('')
    await fetchInventory()
    await fetchActivities()
    setAddingPart(false)
  }

  async function addActivity() {
    if (!activityText.trim()) return
    setAddingActivity(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('work_order_comments').insert({
      work_order_id: id,
      user_id: user?.id,
      body: '[ACTIVITY] [' + activityType.toUpperCase() + '] ' + activityText.trim(),
    })
    setActivityText('')
    await fetchActivities()
    setAddingActivity(false)
  }

  function getSLAInfo() {"""

if old_sla in content:
    content = content.replace(old_sla, new_functions)
    print('Fetch functions added')
else:
    print('getSLAInfo pattern not found')

# 4. Add Parts and Activity to tab buttons
old_tabs = "        <button style={tabStyle(activeTab === 'history')} onClick={() => setActiveTab('history')}>History ({history.length})</button>"
new_tabs = """        <button style={tabStyle(activeTab === 'history')} onClick={() => setActiveTab('history')}>History ({history.length})</button>
        <button style={tabStyle(activeTab === 'parts')} onClick={() => setActiveTab('parts')}>Parts Used</button>
        <button style={tabStyle(activeTab === 'activity')} onClick={() => setActiveTab('activity')}>Activity Log ({activities.length})</button>"""

if old_tabs in content:
    content = content.replace(old_tabs, new_tabs)
    print('Tab buttons added')
else:
    print('Tab buttons pattern not found')

# 5. Add Parts and Activity tab content before closing div
old_end = "\n    </div>\n  )\n}"
new_tabs_content = """
      {activeTab === 'parts' && (
        <div>
          <p style={{ fontSize: 13, color: '#666', marginBottom: '1rem' }}>Log parts and materials consumed on this work order. Stock levels are automatically deducted.</p>

          {partsUsed.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Parts logged this session:</p>
              {partsUsed.map((p, i) => (
                <div key={i} style={{ background: '#f9f9f9', borderRadius: 8, padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13 }}>{p.qty} {p.unit} × {p.name}</span>
                  <span style={{ fontSize: 13, color: '#666' }}>{p.cost ? 'SAR ' + p.cost.toFixed(2) : '—'}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Select Part / Material</label>
              <select value={selectedPartId} onChange={e => setSelectedPartId(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, background: 'white' }}>
                <option value=''>Select inventory item...</option>
                {inventoryItems.map(item => (
                  <option key={item.id} value={item.id}>{item.name} (Stock: {item.stock_quantity} {item.unit})</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Quantity Used</label>
              <input type='number' value={partQty} onChange={e => setPartQty(e.target.value)} min='0.01' step='0.01' placeholder='0' style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' as const }} />
            </div>
            <button onClick={addPart} disabled={addingPart || !selectedPartId || !partQty} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: !selectedPartId || !partQty ? 0.5 : 1 }}>
              {addingPart ? '...' : 'Log Parts'}
            </button>
          </div>

          {inventoryItems.length === 0 && (
            <p style={{ fontSize: 13, color: '#f57f17', marginTop: 12 }}>No inventory items found. <a href='/dashboard/inventory/new' style={{ color: '#1565c0' }}>Add items to inventory first.</a></p>
          )}
        </div>
      )}

      {activeTab === 'activity' && (
        <div>
          <p style={{ fontSize: 13, color: '#666', marginBottom: '1rem' }}>Log structured work updates — what was done, findings, or next steps.</p>

          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              {['update','finding','action','waiting','completed'].map(t => (
                <button key={t} type='button' onClick={() => setActivityType(t)} style={{ padding: '5px 14px', borderRadius: 20, border: '2px solid ' + (activityType === t ? '#1a1a2e' : '#ddd'), background: activityType === t ? '#1a1a2e' : 'white', color: activityType === t ? 'white' : '#666', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={activityText} onChange={e => setActivityText(e.target.value)} placeholder='Describe what was done or found...' style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14 }} />
              <button onClick={addActivity} disabled={addingActivity || !activityText.trim()} style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: !activityText.trim() ? 0.5 : 1 }}>
                {addingActivity ? '...' : 'Log Activity'}
              </button>
            </div>
          </div>

          {activities.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No activity logged yet. Use the form above to record work updates.</p>
          ) : (
            activities.map((a: any) => {
              const body = a.body.replace('[ACTIVITY] ', '')
              const typeMatch = body.match(/^\[(\w+)\]/)
              const type = typeMatch ? typeMatch[1].toLowerCase() : 'update'
              const text = body.replace(/^\[\w+\] /, '')
              const typeColors: Record<string, { bg: string; color: string }> = {
                update: { bg: '#e8eaf6', color: '#283593' },
                finding: { bg: '#fff8e1', color: '#f57f17' },
                action: { bg: '#e8f5e9', color: '#2e7d32' },
                waiting: { bg: '#fce4ec', color: '#880e4f' },
                completed: { bg: '#e8f5e9', color: '#1b5e20' },
                parts: { bg: '#f3e5f5', color: '#6a1b9a' },
              }
              const cfg = typeColors[type] ?? typeColors.update
              return (
                <div key={a.id} style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px 16px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ background: cfg.bg, color: cfg.color, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', marginTop: 2 }}>
                    {type.toUpperCase()}
                  </span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, margin: 0 }}>{text}</p>
                    <p style={{ fontSize: 11, color: '#999', margin: '4px 0 0' }}>
                      {a.user?.full_name ?? 'Unknown'} · {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}"""

if old_end in content:
    content = content.replace(old_end, new_tabs_content)
    print('Tab content added')
else:
    print('Closing div pattern not found')

with open('src/app/dashboard/work-orders/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Work order detail page updated')