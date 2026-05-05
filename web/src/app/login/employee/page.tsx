'use client'

import { type FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { C, F } from '@/lib/brand'
import Link from 'next/link'

const gradH = 'linear-gradient(90deg, #6DCFB0 0%, #3AAECC 50%, #1A7FC1 100%)'

export default function EmployeeLoginPage() {
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
      <div style={{ flex:'0 0 42%', background: C.navy, display:'flex', flexDirection:'column', justifyContent:'space-between', padding:'48px 52px', position:'relative', overflow:'hidden' }}>
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
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, background:'rgba(26,127,193,0.18)', border:'1px solid rgba(26,127,193,0.35)', color:'#6DCFB0', fontSize:11, fontWeight:600, letterSpacing:'0.08em', padding:'5px 16px', borderRadius:999, marginBottom:28 }}>
            👷 &nbsp; EMPLOYEE PORTAL
          </div>
          <div style={{ fontFamily:"'Readex Pro', sans-serif", fontSize:36, fontWeight:700, color:'#fff', direction:'rtl', lineHeight:1.45, marginBottom:12 }}>
            بوابة الموظفين
          </div>
          <div style={{ fontSize:18, fontWeight:600, color:'rgba(255,255,255,0.85)', marginBottom:16, lineHeight:1.4 }}>
            Manage customers, work orders<br/>and your FM operations
          </div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,0.45)', lineHeight:1.7, maxWidth:320 }}>
            Full access to the Serviq FM admin dashboard — manage clients, assign technicians, configure plans, and monitor live operations metrics.
          </div>

          {/* Feature list */}
          <div style={{ marginTop:40, display:'flex', flexDirection:'column', gap:12 }}>
            {[
              ['⚙️', 'Manage work orders & assets'],
              ['👥', 'Customer account management'],
              ['📦', 'Plan selection & billing'],
              ['📈', 'Usage & storage analytics'],
            ].map(([icon, text]) => (
              <div key={text} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'rgba(26,127,193,0.15)', border:'1px solid rgba(26,127,193,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{icon}</div>
                <span style={{ fontSize:13, color:'rgba(255,255,255,0.6)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom note */}
        <div style={{ position:'relative', zIndex:1, fontSize:12, color:'rgba(255,255,255,0.25)' }}>
          Are you a client?{' '}
          <Link href="/login/client" style={{ color:'#6DCFB0', textDecoration:'underline' }}>
            Go to Client Portal →
          </Link>
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{ flex:1, background: C.pageBg, display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 40px' }}>
        <div style={{ width:'100%', maxWidth:420 }}>
          <div style={{ marginBottom:'2.5rem' }}>
            <h1 style={{ fontSize:26, fontWeight:700, color: C.navy, margin:'0 0 6px', fontFamily: F.en }}>
              Employee Sign In
            </h1>
            <p style={{ fontSize:13, color: C.textLight, margin:0, fontFamily: F.en }}>
              Access the Serviq FM admin dashboard &nbsp;·&nbsp;{' '}
              <span style={{ fontFamily:"'Readex Pro', sans-serif" }}>لوحة تحكم الموظفين</span>
            </p>
          </div>

          <div style={{ background: C.white, border:`1px solid ${C.border}`, borderRadius:16, padding:'2rem' }}>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom:'1rem' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color: C.textMid, marginBottom:6, fontFamily: F.en }}>
                  Work Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@serviqfm.com"
                  style={{ width:'100%', padding:'11px 14px', border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, fontFamily: F.en, color: C.textDark, background: C.white, boxSizing:'border-box', outline:'none', transition:'border 0.15s' }}
                  onFocus={e => e.target.style.borderColor = '#1A7FC1'}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>
              <div style={{ marginBottom:'0.5rem' }}>
                <label style={{ display:'block', fontSize:12, fontWeight:600, color: C.textMid, marginBottom:6, fontFamily: F.en }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{ width:'100%', padding:'11px 14px', border:`1px solid ${C.border}`, borderRadius:8, fontSize:14, fontFamily: F.en, color: C.textDark, background: C.white, boxSizing:'border-box', outline:'none', transition:'border 0.15s' }}
                  onFocus={e => e.target.style.borderColor = '#1A7FC1'}
                  onBlur={e => e.target.style.borderColor = C.border}
                />
              </div>
              <div style={{ textAlign:'right', marginBottom:'1.5rem' }}>
                <a href="#" style={{ fontSize:12, color: C.blue, fontFamily: F.en }}>Forgot password?</a>
              </div>
              {error && (
                <div style={{ color: C.danger, marginBottom:'1rem', fontSize:13, background:'#FEE2E2', padding:'10px 12px', borderRadius:8, border:'1px solid #FECACA' }}>
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{ width:'100%', padding:'12px', background: C.navy, color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14, fontFamily: F.en, opacity: loading ? 0.7 : 1, transition:'opacity 0.15s' }}>
                {loading ? 'Signing in...' : 'Sign In to Dashboard →'}
              </button>
            </form>
          </div>

          {/* Divider */}
          <div style={{ margin:'28px 0', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flex:1, height:1, background: C.border }}/>
            <span style={{ fontSize:11, color: C.textLight, fontWeight:500 }}>ADMIN ACCESS</span>
            <div style={{ flex:1, height:1, background: C.border }}/>
          </div>

          {/* Access info */}
          <div style={{ background: C.white, border:`1px solid ${C.border}`, borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:11, fontWeight:700, color: C.textLight, letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:12 }}>Access Levels</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[['Admin','Full system access, user management, billing'],['Manager','Work orders, assets, PM schedules, reports'],['Technician','Assigned work orders, mobile app']].map(([role, desc]) => (
                <div key={role} style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  <div style={{ width:20, height:20, borderRadius:4, background:'#E8F7F3', border:'1px solid rgba(58,174,204,0.3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#3AAECC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                  <div>
                    <span style={{ fontSize:12, fontWeight:600, color: C.navy }}>{role}</span>
                    <span style={{ fontSize:11, color: C.textLight, marginLeft:6 }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p style={{ textAlign:'center', marginTop:24, fontSize:12, color: C.textLight, fontFamily: F.en }}>
            Need an account?{' '}
            <a href="mailto:hello@serviqfm.com" style={{ color: C.blue, fontWeight:600 }}>Contact your administrator</a>
          </p>
        </div>
      </div>
    </div>
  )
}
