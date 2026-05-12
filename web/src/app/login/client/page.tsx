'use client'

import { type FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { C, F, LUMINA_COLORS, LUMINA_SPACING, LUMINA_RADII } from '@/lib/brand'
import Link from 'next/link'
import Button from '@/components/design-system/Button'

const grad = 'linear-gradient(135deg, #6DCFB0 0%, #3AAECC 50%, #1A7FC1 100%)'
const gradH = 'linear-gradient(90deg, #6DCFB0 0%, #3AAECC 50%, #1A7FC1 100%)'

export default function ClientLoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const router  = useRouter()
  const supabase = createClient()

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', fontFamily: F.en }}>
      {/* Left panel — branding */}
      <div style={{ flex:'0 0 42%', background: LUMINA_COLORS.primary, display:'flex', flexDirection:'column', justifyContent:'space-between', padding:'48px 52px', position:'relative', overflow:'hidden' }}>
        {/* Background decoration */}
        <div style={{ position:'absolute', top:-180, right:-180, width:520, height:520, borderRadius:'50%', background:'radial-gradient(circle, rgba(109,207,176,0.14) 0%, transparent 65%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:-140, left:-140, width:440, height:440, borderRadius:'50%', background:'radial-gradient(circle, rgba(26,127,193,0.12) 0%, transparent 65%)', pointerEvents:'none' }}/>
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(109,207,176,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(109,207,176,0.04) 1px, transparent 1px)', backgroundSize:'48px 48px', pointerEvents:'none' }}/>

        {/* Logo */}
        <div style={{ position:'relative', zIndex:1 }}>
          <Link href="/" style={{ display:'inline-flex', alignItems:'center', gap:10, textDecoration:'none' }}>
            <div style={{ width:42, height:42, borderRadius:11, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <span style={{ fontSize:20, fontWeight:800, fontFamily: F.en, background:gradH, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>S</span>
            </div>
            <div>
              <div style={{ fontSize:20, fontWeight:700, fontFamily: F.en, color:'#fff' }}>
                Serviq<span style={{ background:gradH, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>FM</span>
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', letterSpacing:'0.08em', textTransform:'uppercase' }}>Facility Management</div>
            </div>
          </Link>
        </div>

        {/* Center copy */}
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(109,207,176,0.12)', border:'1px solid rgba(109,207,176,0.28)', color:'#6DCFB0', fontSize:11, fontWeight:600, letterSpacing:'0.08em', padding:'5px 16px', borderRadius:999, marginBottom:28 }}>
            🏢 &nbsp; CLIENT PORTAL
          </div>
          <div style={{ fontFamily:"'Readex Pro', sans-serif", fontSize:36, fontWeight:700, color:'#fff', direction:'rtl', lineHeight:1.45, marginBottom:12 }}>
            بوابة العملاء
          </div>
          <div style={{ fontSize:18, fontWeight:600, color:'rgba(255,255,255,0.85)', marginBottom:16, lineHeight:1.4 }}>
            Track your work orders<br/>and facility requests
          </div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,0.45)', lineHeight:1.7, maxWidth:320 }}>
            View live status on your maintenance requests, download ZATCA-compliant invoices, and communicate with your facility team — in Arabic or English.
          </div>

          {/* Feature list */}
          <div style={{ marginTop:40, display:'flex', flexDirection:'column', gap:12 }}>
            {[
              ['📋', 'View & track work orders'],
              ['📄', 'Download VAT invoices'],
              ['💬', 'Communicate with your team'],
              ['📊', 'Access facility reports'],
            ].map(([icon, text]) => (
              <div key={text} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(109,207,176,0.12)', border:'1px solid rgba(109,207,176,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{icon}</div>
                <span style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom note */}
        <div style={{ position:'relative', zIndex:1, fontSize:12, color:'rgba(255,255,255,0.25)' }}>
          Are you an employee?{' '}
          <Link href="/login/employee" style={{ color:'#6DCFB0', textDecoration:'underline' }}>
            Go to Employee Portal →
          </Link>
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{ flex:1, background: LUMINA_COLORS.background, display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 40px' }}>
        <div style={{ width:'100%', maxWidth:420 }}>
          <div style={{ marginBottom:'2.5rem' }}>
            <h1 style={{ fontSize:26, fontWeight:700, color: LUMINA_COLORS.primary, margin:'0 0 6px', fontFamily: F.en }}>
              Client Sign In
            </h1>
            <p style={{ fontSize:13, color: LUMINA_COLORS.onSurfaceVariant, margin:0, fontFamily: F.en }}>
              Access your facility management portal &nbsp;·&nbsp;{' '}
              <span style={{ fontFamily:"'Readex Pro', sans-serif" }}>الدخول إلى بوابتك</span>
            </p>
          </div>

          <div style={{ background: LUMINA_COLORS.surfaceContainerLowest, border:`1px solid ${LUMINA_COLORS.outlineVariant}`, borderRadius:LUMINA_RADII.lg, padding:'2rem' }}>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom:'1rem' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color: LUMINA_COLORS.onSurfaceVariant, marginBottom:6, fontFamily: F.en }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@company.com"
                  style={{ width:'100%', padding:'11px 14px', border:`1px solid ${LUMINA_COLORS.outline}`, borderRadius:LUMINA_RADII.md, fontSize:14, fontFamily: F.en, color: LUMINA_COLORS.onSurface, background: LUMINA_COLORS.surfaceContainerLowest, boxSizing:'border-box', outline:'none', transition:'border 0.15s' }}
                  onFocus={e => e.target.style.borderColor = LUMINA_COLORS.primary}
                  onBlur={e => e.target.style.borderColor = LUMINA_COLORS.outline}
                />
              </div>
              <div style={{ marginBottom:'0.5rem' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color: LUMINA_COLORS.onSurfaceVariant, marginBottom:6, fontFamily: F.en }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{ width:'100%', padding:'11px 14px', border:`1px solid ${LUMINA_COLORS.outline}`, borderRadius:LUMINA_RADII.md, fontSize:14, fontFamily: F.en, color: LUMINA_COLORS.onSurface, background: LUMINA_COLORS.surfaceContainerLowest, boxSizing:'border-box', outline:'none', transition:'border 0.15s' }}
                  onFocus={e => e.target.style.borderColor = LUMINA_COLORS.primary}
                  onBlur={e => e.target.style.borderColor = LUMINA_COLORS.outline}
                />
              </div>
              <div style={{ textAlign:'right', marginBottom:'1.5rem' }}>
                <a href="#" style={{ fontSize:12, color: LUMINA_COLORS.primary, fontFamily: F.en }}>Forgot password?</a>
              </div>
              {error && (
                <div style={{ color: LUMINA_COLORS.error, marginBottom:'1rem', fontSize:13, background: LUMINA_COLORS.errorContainer, padding:'10px 12px', borderRadius:LUMINA_RADII.md, border:`1px solid ${LUMINA_COLORS.error}` }}>
                  {error}
                </div>
              )}
              <Button
                variant="primary"
                fullWidth
                isLoading={loading}
                type="submit"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In to Client Portal →'}
              </Button>
            </form>
          </div>

          {/* Divider */}
          <div style={{ margin:'28px 0', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flex:1, height:1, background: LUMINA_COLORS.outlineVariant }}/>
            <span style={{ fontSize:11, color: LUMINA_COLORS.onSurfaceVariant, fontWeight:500 }}>PORTAL ACCESS</span>
            <div style={{ flex:1, height:1, background: LUMINA_COLORS.outlineVariant }}/>
          </div>

          {/* Trust badges */}
          <div style={{ display:'flex', justifyContent:'center', gap:16, flexWrap:'wrap' }}>
            {['🔒 Secure login','📄 ZATCA invoices','🌐 Arabic & English'].map(b => (
              <span key={b} style={{ fontSize:11, color: LUMINA_COLORS.onSurfaceVariant, background: LUMINA_COLORS.surfaceContainerLowest, border:`1px solid ${LUMINA_COLORS.outlineVariant}`, padding:'5px 12px', borderRadius:999 }}>{b}</span>
            ))}
          </div>

          <p style={{ textAlign:'center', marginTop:28, fontSize:12, color: LUMINA_COLORS.onSurfaceVariant, fontFamily: F.en }}>
            Not a client yet?{' '}
            <Link href="/#waitlist" style={{ color: LUMINA_COLORS.primary, fontWeight:600 }}>Join the waitlist →</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
