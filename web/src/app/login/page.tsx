'use client'

import { type FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', padding: '0 1rem' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Serviq FM</h1>
      <p style={{ marginBottom: '2rem', color: '#666' }}>Sign in to your account</p>

      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6 }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6 }}
          />
        </div>

        {error && (
          <p style={{ color: 'red', marginBottom: '1rem', fontSize: 14 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '10px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}