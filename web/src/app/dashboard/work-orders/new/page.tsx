'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function NewWorkOrderPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_at: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not logged in')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('users')
      .select('organisation_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      setError('User profile not found. Please contact support.')
      setLoading(false)
      return
    }

    const { error: insertError } = await supabase.from('work_orders').insert({
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      due_at: form.due_at || null,
      created_by: user.id,
      organisation_id: profile.organisation_id,
      status: 'new',
      source: 'manual',
    })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
    } else {
      router.push('/dashboard/work-orders')
    }
  }

  const fieldStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 8,
    fontSize: 14,
    boxSizing: 'border-box' as const,
  }

  const labelStyle = {
    display: 'block' as const,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 500,
    color: '#444',
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href="/dashboard/work-orders" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
          ← Back to Work Orders
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>New Work Order</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input
            name="title"
            value={form.title}
            onChange={handleChange}
            required
            placeholder="e.g. AC unit not cooling — Room 204"
            style={fieldStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            rows={4}
            placeholder="Describe the issue in detail..."
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
        </div>

        <div>
          <label style={labelStyle}>Priority *</label>
          <select name="priority" value={form.priority} onChange={handleChange} style={fieldStyle}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Due Date</label>
          <input
            name="due_at"
            type="datetime-local"
            value={form.due_at}
            onChange={handleChange}
            style={fieldStyle}
          />
        </div>

        {error && (
          <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            background: '#1a1a2e',
            color: 'white',
            padding: '10px',
            borderRadius: 8,
            border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            fontSize: 15,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Creating...' : 'Create Work Order'}
        </button>
      </form>
    </div>
  )
}