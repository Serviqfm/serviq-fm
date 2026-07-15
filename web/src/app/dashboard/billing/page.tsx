'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { C, cardStyle } from '@/lib/brand'

// Admin-only billing page. Shows the org's current plan + a Manage/Subscribe
// button that hits /api/billing/checkout (Checkout for new subs, Billing Portal
// for existing ones). When Stripe is unconfigured the route returns 501 and we
// surface a plain "not configured" message.
export default function BillingPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [org, setOrg] = useState<any>(null)
  const [role, setRole] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (typeof window !== 'undefined') window.location.href = '/login'; return }
      const { data: profile } = await supabase
        .from('users')
        .select('role, organisation:organisation_id(id, name, plan, billing_status, renews_at, stripe_subscription_id)')
        .eq('id', user.id)
        .single()
      if (profile) {
        setRole(profile.role ?? '')
        setOrg(profile.organisation)
      }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function manage(plan: string) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 501) { setError('Billing is not configured for this deployment.'); return }
      if (!res.ok || !data.url) { setError(data.error || 'Could not start billing session.'); return }
      window.location.href = data.url
    } catch {
      setError('Network error.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: C.textMid }}>Loading…</div>

  if (role !== 'admin') {
    return <div style={{ padding: '2rem', color: C.textMid }}>Billing is only available to organisation admins.</div>
  }

  const plan: string = org?.plan ?? 'free'
  const status: string = org?.billing_status ?? 'paid'
  const subscribed = !!org?.stripe_subscription_id
  const statusColor = status === 'paid' ? C.success : status === 'failed' ? C.danger : C.warning

  return (
    <div style={{ padding: '2rem', maxWidth: 720 }}>
      <h1 style={{ color: C.textDark, fontSize: '1.5rem', marginBottom: '1.5rem' }}>Billing</h1>

      <div style={{ ...cardStyle, marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
          <span style={{ color: C.textMid }}>Current plan</span>
          <strong style={{ color: C.textDark, fontSize: '1.25rem', textTransform: 'capitalize' }}>{plan}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
          <span style={{ color: C.textMid }}>Billing status</span>
          <span style={{ color: statusColor, fontWeight: 600, textTransform: 'capitalize' }}>{status}</span>
        </div>
        {org?.renews_at && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ color: C.textMid }}>Renews</span>
            <span style={{ color: C.textDark }}>{new Date(org.renews_at).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger, borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {subscribed ? (
        <button onClick={() => manage(plan)} disabled={busy}
          style={{ background: C.navy, color: C.white, border: 'none', borderRadius: 8, padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Opening…' : 'Manage subscription'}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={() => manage('starter')} disabled={busy}
            style={{ background: C.white, color: C.navy, border: `1px solid ${C.navy}`, borderRadius: 8, padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            Subscribe — Starter
          </button>
          <button onClick={() => manage('pro')} disabled={busy}
            style={{ background: C.navy, color: C.white, border: 'none', borderRadius: 8, padding: '0.75rem 1.5rem', fontSize: '1rem', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            Subscribe — Pro
          </button>
        </div>
      )}

      <p style={{ color: C.textLight, fontSize: '0.85rem', marginTop: '1.5rem' }}>
        Enterprise plans are handled manually — contact your account manager.
      </p>
    </div>
  )
}
