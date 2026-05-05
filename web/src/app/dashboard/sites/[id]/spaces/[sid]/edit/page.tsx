'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { C, F, pageStyle, primaryBtn, secondaryBtn, inputStyle } from '@/lib/brand'

export default function EditSpacePage({ params }: { params: { id: string; sid: string } }) {
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [floor, setFloor] = useState('')
  const [description, setDescription] = useState('')
  const [floors, setFloors] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('spaces').select('*').eq('id', params.sid).single()
      if (data) { setName(data.name); setNameAr(data.name_ar || ''); setFloor(data.floor); setDescription(data.description || '') }
      const { data: fl } = await supabase.from('spaces').select('floor').eq('site_id', params.id)
      if (fl) setFloors(Array.from(new Set(fl.map((s: { floor: string }) => s.floor))))
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.sid])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase.from('spaces').update({
      name, name_ar: nameAr || null, floor, description: description || null,
    }).eq('id', params.sid)
    if (err) { setError(err.message); setLoading(false); return }
    router.push(`/dashboard/sites/${params.id}/spaces`)
  }

  return (
    <div style={{ ...pageStyle, maxWidth: 560 }}>
      <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 8px' }}>
        <Link href={`/dashboard/sites/${params.id}/spaces`} style={{ color: C.blue, textDecoration: 'none' }}>← Spaces</Link>
      </p>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 24px' }}>Edit Space</h1>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Name (EN) *</label>
            <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Name (AR)</label>
            <input value={nameAr} onChange={e => setNameAr(e.target.value)} style={{ ...inputStyle, direction: 'rtl', fontFamily: F.ar }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Floor *</label>
            <input value={floor} onChange={e => setFloor(e.target.value)} required list="floors-list-edit" style={inputStyle} />
            <datalist id="floors-list-edit">{floors.map(f => <option key={f} value={f} />)}</datalist>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
          </div>
          {error && <p style={{ color: C.danger, fontSize: 13, fontFamily: F.en, margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={loading} style={primaryBtn}>{loading ? 'Saving...' : 'Save Changes'}</button>
            <Link href={`/dashboard/sites/${params.id}/spaces`}><button type="button" style={secondaryBtn}>Cancel</button></Link>
          </div>
        </form>
      </div>
    </div>
  )
}
