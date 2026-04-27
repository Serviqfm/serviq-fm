'use client'

import { type FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { C, F } from '@/lib/brand'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  return (
    <div style={{ minHeight: '100vh', background: C.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 1.5rem' }}>

        {/* Logo mark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '2.5rem', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 19, fontWeight: 800, fontFamily: F.en, background: C.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>S</span>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: F.en }}>
              <span style={{ color: C.navy }}>Serviq</span><span style={{ color: C.teal }}>FM</span>
            </div>
            <div style={{ fontSize: 10, color: C.textLight, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: F.en }}>Facility Management</div>
          </div>
        </div>

        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 16, padding: '2rem' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.navy, margin: '0 0 0.25rem', fontFamily: F.en }}>Sign in</h1>
          <p style={{ fontSize: 13, color: C.textLight, margin: '0 0 1.5rem' }}>Welcome back to Serviq FM</p>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: F.en, color: C.textDark, background: C.white, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textMid, marginBottom: 6, fontFamily: F.en }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                style={{ width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontFamily: F.en, color: C.textDark, background: C.white, boxSizing: 'border-box' }} />
            </div>
            {error && <p style={{ color: C.danger, marginBottom: '1rem', fontSize: 13, background: '#FEE2E2', padding: '10px 12px', borderRadius: 8 }}>{error}</p>}
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '11px', background: C.navy, color: C.white, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: F.en, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}