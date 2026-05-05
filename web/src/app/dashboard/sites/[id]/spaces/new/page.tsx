'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { C, F, pageStyle, primaryBtn, secondaryBtn, inputStyle } from '@/lib/brand'

export default function NewSpacePage({ params }: { params: { id: string } }) {
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
    async function loadFloors() {
      const { data } = await supabase.from('spaces').select('floor').eq('site_id', params.id)
      if (data) setFloors(Array.from(new Set(data.map((s: { floor: string }) => s.floor))))
    }
    loadFloors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setError('Profile not found'); setLoading(false); return }

    const { error: err } = await supabase.from('spaces').insert({
      organisation_id: profile.organisation_id,
      site_id: params.id,
      name, name_ar: nameAr || null, floor, description: description || null,
    })
    if (err) { setError(err.message); setLoading(false); return }
    router.push(`/dashboard/sites/${params.id}/spaces`)
  }

  return (
    <div style={{ ...pageStyle, maxWidth: 560 }}>
      <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '0 0 8px' }}>
        <Link href={`/dashboard/sites/${params.id}/spaces`} style={{ color: C.blue, textDecoration: 'none' }}>← Spaces</Link>
      </p>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: '0 0 24px' }}>Add Space</h1>
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: '2rem' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Name (EN) *</label>
            <input value={name} onChange={e => setName(e.target.value)} required style={inputStyle} placeholder="e.g. Room 101" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Name (AR)</label>
            <input value={nameAr} onChange={e => setNameAr(e.target.value)} style={{ ...inputStyle, direction: 'rtl', fontFamily: F.ar }} placeholder="الاسم بالعربية" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Floor *</label>
            <input value={floor} onChange={e => setFloor(e.target.value)} required list="floors-list" style={inputStyle} placeholder="e.g. Ground Floor" />
            <datalist id="floors-list">{floors.map(f => <option key={f} value={f} />)}</datalist>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder="Optional description..." />
          </div>
          {error && <p style={{ color: C.danger, fontSize: 13, fontFamily: F.en, margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={loading} style={primaryBtn}>{loading ? 'Saving...' : 'Add Space'}</button>
            <Link href={`/dashboard/sites/${params.id}/spaces`}><button type="button" style={secondaryBtn}>Cancel</button></Link>
          </div>
        </form>
      </div>
    </div>
  )
}
