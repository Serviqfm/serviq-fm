'use client'

import { type FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'

export default function ClientLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
    if (signInErr || !signIn.user) {
      setError(signInErr?.message ?? 'Sign-in failed')
      setLoading(false)
      return
    }
    const userId = signIn.user.id

    // Step A: platform admin → /platform/dashboard
    const { data: pa } = await supabase
      .from('platform_admins')
      .select('id')
      .eq('id', userId)
      .single()
    if (pa) {
      await fetch('/api/platform/me/sign-in-touch', { method: 'POST' }).catch(() => {})
      router.push('/platform/dashboard')
      return
    }

    // Step B: tenant user — check is_active, disabled, org.offboarded_at
    const { data: profile } = await supabase
      .from('users')
      .select('is_active, disabled, organisations(offboarded_at)')
      .eq('id', userId)
      .single() as {
        data: {
          is_active: boolean
          disabled: boolean
          organisations: { offboarded_at: string | null } | null
        } | null
      }

    if (!profile) {
      await supabase.auth.signOut()
      setError('No tenant or platform account found for this email.')
      setLoading(false)
      return
    }
    if (
      profile.is_active === false ||
      profile.disabled === true ||
      profile.organisations?.offboarded_at
    ) {
      await supabase.auth.signOut()
      setError('Account is disabled or your organisation has been offboarded.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col star-pattern overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-2 w-full bg-surface/80 backdrop-blur-md border-b border-outline-variant">
        <Logo href="/login" size={140} />
        <div className="flex items-center gap-4">
          <Link href="/login/employee" className="text-xs font-semibold text-on-surface-variant hover:text-secondary transition-colors">
            Employee Portal →
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="flex-grow flex items-center justify-center px-6 py-8 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-full max-h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden rounded-xl shadow-sm border border-outline-variant bg-surface-container-lowest relative z-10">
          {/* Left: brand panel */}
          <div className="hidden lg:flex flex-col justify-between p-8 bg-primary relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-80 h-80 bg-primary-container/20 rounded-full blur-[100px]" />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-secondary/30 rounded-full blur-[100px]" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 text-on-primary text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6">
                <span className="material-symbols-outlined text-sm">business_center</span>
                CLIENT PORTAL
              </div>
              <h1 className="text-on-primary text-4xl lg:text-5xl mb-4 leading-tight font-bold">
                بوابة العملاء<br />
                <span className="text-3xl font-semibold opacity-90">Client Portal</span>
              </h1>
              <p className="text-on-primary/80 text-base max-w-md">
                View live status on your maintenance requests, download ZATCA-compliant invoices, and communicate with your facility team — in Arabic or English.
              </p>
            </div>

            <div className="relative z-10 flex flex-col gap-4">
              {[
                { icon: 'receipt_long', text: 'View & track work orders' },
                { icon: 'description', text: 'Download VAT invoices' },
                { icon: 'forum', text: 'Communicate with your team' },
                { icon: 'bar_chart', text: 'Access facility reports' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-on-primary text-lg">{icon}</span>
                  </div>
                  <span className="text-on-primary/70 text-sm">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: form */}
          <div className="p-8 flex flex-col justify-center bg-surface-container-lowest">
            <div className="max-w-md w-full mx-auto">
              <div className="mb-8">
                <div className="inline-flex items-center justify-center p-3 rounded-xl bg-primary/10 text-primary mb-4">
                  <span className="material-symbols-outlined text-3xl">business_center</span>
                </div>
                <h2 className="text-2xl font-bold text-on-surface mb-1">Client Sign In</h2>
                <p className="text-on-surface-variant text-sm">
                  Access your facility management portal &nbsp;·&nbsp;
                  <span style={{ fontFamily: "'Readex Pro', sans-serif" }}>الدخول إلى بوابتك</span>
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-primary text-xs font-semibold uppercase tracking-wider block">
                    Email Address
                  </label>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">
                      alternate_email
                    </span>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      placeholder="you@company.com"
                      className="w-full pl-12 pr-4 py-3.5 bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-outline-variant"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label htmlFor="password" className="text-primary text-xs font-semibold uppercase tracking-wider block">
                      Password
                    </label>
                    <a href="/reset-password" className="text-xs font-semibold text-on-surface-variant hover:text-primary transition-colors">
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">
                      lock
                    </span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="w-full pl-12 pr-12 py-3.5 bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all placeholder:text-outline-variant"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                    >
                      <span className="material-symbols-outlined">{showPassword ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-error/10 border border-error/20 text-error text-sm px-4 py-3 rounded-xl">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-primary text-on-primary font-bold rounded-xl shadow-lg hover:shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group mt-2 disabled:opacity-60"
                >
                  <span>{loading ? 'Signing in...' : 'Sign In to Client Portal'}</span>
                  {!loading && (
                    <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
                  )}
                </button>
              </form>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex-1 h-px bg-outline-variant" />
                <span className="text-xs text-outline font-semibold uppercase">TRUST & SECURITY</span>
                <div className="flex-1 h-px bg-outline-variant" />
              </div>

              <div className="mt-4 flex flex-wrap justify-center gap-3">
                {['🔒 Secure login', '📄 ZATCA invoices', '🌐 Arabic & English'].map(b => (
                  <span key={b} className="text-xs text-on-surface-variant bg-surface-container-low border border-outline-variant px-3 py-1.5 rounded-full">{b}</span>
                ))}
              </div>

              <footer className="mt-8 text-center">
                <p className="text-xs text-outline leading-relaxed">
                  © 2026 Serviq FM. ZATCA Compliant FM Solutions.
                </p>
              </footer>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full flex flex-col md:flex-row justify-between items-center px-8 py-4 gap-4 border-t border-outline-variant mt-auto">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <Logo href="/" size={110} />
          <div className="flex gap-4">
            <a href="#" className="text-on-surface-variant text-sm hover:text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="text-on-surface-variant text-sm hover:text-primary transition-colors">Support Portal</a>
          </div>
        </div>
        <div className="flex items-center gap-2 text-outline text-xs font-semibold">
          <span className="material-symbols-outlined text-sm">shield_lock</span>
          SECURE PORTAL 256-BIT ENCRYPTION
        </div>
      </footer>
    </div>
  )
}
