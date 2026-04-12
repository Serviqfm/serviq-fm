import os

os.makedirs('src/app/dashboard/inspections/templates/[id]/edit', exist_ok=True)

template_edit = """'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

export default function EditTemplatePage() {
  const router = useRouter()
  const { id } = useParams()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [vertical, setVertical] = useState('general')
  const [items, setItems] = useState<any[]>([])

  useEffect(() => { loadTemplate() }, [id])

  async function loadTemplate() {
    const { data } = await supabase.from('inspection_templates').select('*').eq('id', id).single()
    if (data) {
      setName(data.name)
      setVertical(data.vertical ?? 'general')
      setItems(data.items ?? [])
    }
    setLoading(false)
  }

  function addItem() {
    setItems(prev => [...prev, { id: String(Date.now()), label: '', label_ar: '', type: 'pass_fail', required: false }])
  }

  function updateItem(itemId: string, field: string, value: any) {
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, [field]: value } : item))
  }

  function removeItem(itemId: string) {
    setItems(prev => prev.filter(item => item.id !== itemId))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('inspection_templates').update({
      name,
      vertical: vertical || null,
      items,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (updateError) { setError(updateError.message); setSaving(false) }
    else router.push('/dashboard/inspections')
  }

  const fieldStyle = { width: '100%', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' as const, background: 'white' }
  const typeOptions = [
    { value: 'pass_fail', label: 'Pass / Fail' },
    { value: 'yes_no', label: 'Yes / No' },
    { value: 'score', label: 'Score (1-5)' },
    { value: 'text', label: 'Free Text' },
    { value: 'photo', label: 'Photo Required' },
  ]

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/inspections' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Inspections</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Edit Template</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#444' }}>Template Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required style={{ ...fieldStyle, fontSize: 14, padding: '8px 12px' }} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#444' }}>Vertical</label>
            <select value={vertical} onChange={e => setVertical(e.target.value)} style={{ ...fieldStyle, fontSize: 14, padding: '8px 12px' }}>
              <option value='general'>General</option>
              <option value='school'>School</option>
              <option value='retail'>Retail</option>
              <option value='compound'>Compound</option>
              <option value='hotel'>Hotel</option>
            </select>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#444' }}>Checklist Items ({items.length})</label>
            <button type='button' onClick={addItem} style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid #1a1a2e', background: 'white', color: '#1a1a2e', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>+ Add Item</button>
          </div>
          {items.map((item, idx) => (
            <div key={item.id} style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#999', minWidth: 20 }}>{idx + 1}.</span>
                <input value={item.label} onChange={e => updateItem(item.id, 'label', e.target.value)} placeholder='Item label (English) *' style={{ ...fieldStyle, flex: 2 }} />
                <select value={item.type} onChange={e => updateItem(item.id, 'type', e.target.value)} style={{ ...fieldStyle, flex: 1 }}>
                  {typeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type='checkbox' checked={item.required} onChange={e => updateItem(item.id, 'required', e.target.checked)} id={'req-' + item.id} />
                  <label htmlFor={'req-' + item.id} style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>Required</label>
                </div>
                <button type='button' onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
              </div>
              <div style={{ paddingLeft: 28 }}>
                <input value={item.label_ar} onChange={e => updateItem(item.id, 'label_ar', e.target.value)} placeholder='Item label (Arabic — optional)' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
              </div>
            </div>
          ))}
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type='submit' disabled={saving} style={{ flex: 1, background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <a href='/dashboard/inspections' style={{ flex: 1 }}>
            <button type='button' style={{ width: '100%', background: 'white', color: '#333', padding: '11px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', fontWeight: 500, fontSize: 15 }}>Cancel</button>
          </a>
        </div>
      </form>
    </div>
  )
}"""

with open('src/app/dashboard/inspections/templates/[id]/edit/page.tsx', 'w', encoding='utf-8') as f:
    f.write(template_edit)
print('Template edit page written')