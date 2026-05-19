'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

  const inputCls = "w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[680px] mx-auto space-y-6">
        <div>
          <p className="mb-2">
            <Link href={`/dashboard/sites/${params.id}/spaces`} className="text-on-surface-variant text-sm hover:text-primary transition-colors">← Spaces</Link>
          </p>
          <h1 className="text-3xl font-bold text-on-surface">Edit Space</h1>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Name (EN) *</label>
              <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Name (AR)</label>
              <input value={nameAr} onChange={e => setNameAr(e.target.value)} className={`${inputCls} text-right`} dir="rtl" />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Floor *</label>
              <input value={floor} onChange={e => setFloor(e.target.value)} required list="floors-list-edit" className={inputCls} />
              <datalist id="floors-list-edit">{floors.map(f => <option key={f} value={f} />)}</datalist>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Description</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} className={`${inputCls} min-h-[80px] resize-y`} />
            </div>
            {error && <p className="text-error text-sm">{error}</p>}
            <div className="flex gap-2.5">
              <button type="submit" disabled={loading}
                className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-70">
                {loading ? 'Saving...' : 'Save Changes'}
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
