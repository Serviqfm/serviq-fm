'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

  const inputCls = "w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[680px] mx-auto space-y-6">
        <div>
          <p className="mb-2">
            <Link href={`/dashboard/sites/${params.id}/spaces`} className="text-on-surface-variant text-sm hover:text-primary transition-colors">← Spaces</Link>
          </p>
          <h1 className="text-3xl font-bold text-on-surface">Add Space</h1>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Name (EN) *</label>
              <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} placeholder="e.g. Room 101" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Name (AR)</label>
              <input value={nameAr} onChange={e => setNameAr(e.target.value)} className={`${inputCls} text-right`} dir="rtl" placeholder="الاسم بالعربية" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Floor *</label>
              <input value={floor} onChange={e => setFloor(e.target.value)} required list="floors-list" className={inputCls} placeholder="e.g. Ground Floor" />
              <datalist id="floors-list">{floors.map(f => <option key={f} value={f} />)}</datalist>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className={`${inputCls} min-h-[80px] resize-y`} placeholder="Optional description..." />
            </div>
            {error && <p className="text-error text-sm">{error}</p>}
            <div className="flex gap-2.5">
              <button type="submit" disabled={loading}
                className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-70">
                {loading ? 'Saving...' : 'Add Space'}
              </button>
              <Link href={`/dashboard/sites/${params.id}/spaces`}>
                <button type="button" className="border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">Cancel</button>
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
