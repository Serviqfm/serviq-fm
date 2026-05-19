'use client'

import { useState, useEffect, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'

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
  const { isHidden, isRequired, loading: configLoading } = useFieldConfig('spaces_new')
  const isReq = (key: string) => isRequired(key) || isSystemRequired('spaces_new', key)

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
    const res = await fetch('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: params.id,
        name,
        name_ar: nameAr,
        floor,
        description,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.error ?? 'Failed to create space')
      setLoading(false)
      return
    }
    router.push(`/dashboard/sites/${params.id}/spaces`)
  }

  const inputCls = "w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"

  if (configLoading) return <div className="p-8 text-on-surface-variant">Loading form…</div>

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
            {!isHidden('name') && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Name (EN){isReq('name') && <span className="text-error"> *</span>}</label>
                <input value={name} onChange={e => setName(e.target.value)} required={isReq('name')} className={inputCls} placeholder="e.g. Room 101" />
              </div>
            )}
            {!isHidden('name_ar') && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Name (AR){isReq('name_ar') && <span className="text-error"> *</span>}</label>
                <input value={nameAr} onChange={e => setNameAr(e.target.value)} required={isReq('name_ar')} className={`${inputCls} text-right`} dir="rtl" placeholder="الاسم بالعربية" />
              </div>
            )}
            {!isHidden('floor') && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Floor{isReq('floor') && <span className="text-error"> *</span>}</label>
                <input value={floor} onChange={e => setFloor(e.target.value)} required={isReq('floor')} list="floors-list" className={inputCls} placeholder="e.g. Ground Floor" />
                <datalist id="floors-list">{floors.map(f => <option key={f} value={f} />)}</datalist>
              </div>
            )}
            {!isHidden('description') && (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Description{isReq('description') && <span className="text-error"> *</span>}</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} required={isReq('description')} className={`${inputCls} min-h-[80px] resize-y`} placeholder="Optional description..." />
              </div>
            )}
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
