'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function OffboardPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function confirm() {
    setLoading(true); setError('')
    const res = await fetch(`/api/platform/tenants/${id}/offboard`, { method: 'POST' })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    setResult(data.signed_url)
  }

  if (result) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Offboarded</h1>
        <p className="text-sm text-on-surface-variant mb-2">Tenant offboarded. Export URL (also emailed):</p>
        <a href={result} className="text-primary break-all">{result}</a>
        <div className="mt-6">
          <button onClick={() => router.push(`/platform/tenants/${id}`)} className="bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-semibold">Back to tenant</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-error">Offboard Tenant</h1>
      <ul className="text-sm text-on-surface-variant mb-6 list-disc pl-6 space-y-1">
        <li>All tenant data will be exported to a zip and uploaded to private storage</li>
        <li>Signed download URL emailed to tenant admins + you (valid 30 days)</li>
        <li>All tenant users will be set to disabled (cannot log in)</li>
        <li>Organisation marked as offboarded; data retained until reactivation</li>
      </ul>
      <div className="mb-4">
        <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5">Type OFFBOARD to confirm</label>
        <input value={confirmText} onChange={e => setConfirmText(e.target.value)}
          className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm" />
      </div>
      {error && <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm mb-4">{error}</div>}
      <button onClick={confirm} disabled={confirmText !== 'OFFBOARD' || loading}
        className="bg-error text-white px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
        {loading ? 'Offboarding…' : 'Offboard'}
      </button>
    </div>
  )
}
