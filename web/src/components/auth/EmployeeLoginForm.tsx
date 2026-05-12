'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function EmployeeLoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle login
  }

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col font-body-md overflow-x-hidden star-pattern">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-2 w-full bg-surface/80 backdrop-blur-md border-b border-outline-variant">
        <div className="flex items-center gap-2">
          <span className="text-primary font-bold tracking-tight text-2xl">
            Serviq Lumina
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-outline-variant hover:bg-surface-container-high transition-colors cursor-pointer active:scale-95">
            <span className="material-symbols-outlined text-sm">language</span>
            <span className="text-xs font-semibold text-on-surface-variant">ARABIC</span>
          </button>
          <button className="hidden md:flex items-center gap-1 text-on-surface-variant hover:text-primary transition-colors">
            <span className="material-symbols-outlined">help</span>
            <span className="text-xs font-semibold">SUPPORT</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center px-6 py-8 relative">
        {/* Background decorative element */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-full max-h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden rounded-xl shadow-sm border border-outline-variant bg-surface-container-lowest relative z-10">
          {/* Left Side: Brand/Visual */}
          <div className="hidden lg:flex flex-col justify-between p-8 bg-primary relative overflow-hidden">
            {/* Abstract Glow */}
            <div className="absolute -top-20 -right-20 w-80 h-80 bg-primary-container/20 rounded-full blur-[100px]" />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-secondary/30 rounded-full blur-[100px]" />

            <div className="relative z-10">
              <h1 className="text-on-primary text-4xl lg:text-5xl mb-4 leading-tight font-bold">
                Precision in Every <br />
                Square Meter.
              </h1>
              <p className="text-on-primary/80 text-lg max-w-md">
                The next generation of Saudi technical facility management. Intelligent, fluid, and built for operational excellence.
              </p>
            </div>

            <div className="relative z-10 flex flex-col gap-6">
              <div className="flex gap-3">
                <div className="p-3 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
                  <span className="material-symbols-outlined text-on-primary text-2xl">
                    engineering
                  </span>
                </div>
                <div className="p-3 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
                  <span className="material-symbols-outlined text-on-primary text-2xl">
                    analytics
                  </span>
                </div>
                <div className="p-3 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
                  <span className="material-symbols-outlined text-on-primary text-2xl">
                    security
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-12 bg-primary-container rounded-full" />
                <div className="h-1 w-4 bg-white/30 rounded-full" />
                <div className="h-1 w-4 bg-white/30 rounded-full" />
              </div>
            </div>
          </div>

          {/* Right Side: Login Form */}
          <div className="p-8 flex flex-col justify-center bg-surface-container-lowest">
            <div className="max-w-md w-full mx-auto">
              <div className="mb-8">
                <div className="inline-flex items-center justify-center p-3 rounded-xl bg-primary/10 text-primary mb-4">
                  <span className="material-symbols-outlined text-3xl">
                    admin_panel_settings
                  </span>
                </div>
                <h2 className="text-on-surface text-3xl mb-2 font-bold">Portal Access</h2>
                <p className="text-on-surface-variant">
                  Log in to manage your facility assets and operations.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email Field */}
                <div className="space-y-2">
                  <label
                    htmlFor="email"
                    className="text-primary text-xs font-semibold uppercase block"
                  >
                    Corporate Email
                  </label>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-secondary transition-colors">
                      alternate_email
                    </span>
                    <input
                      id="email"
                      type="email"
                      placeholder="name@serviq.sa"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-3.5 bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-all placeholder:text-outline-variant"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label
                      htmlFor="password"
                      className="text-primary text-xs font-semibold uppercase block"
                    >
                      Password
                    </label>
                    <a
                      href="#"
                      className="text-xs font-semibold text-secondary hover:underline transition-all"
                    >
                      Forgot Password?
                    </a>
                  </div>
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-secondary transition-colors">
                      lock
                    </span>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3.5 bg-surface-container-low border border-outline-variant rounded-xl focus:ring-2 focus:ring-secondary focus:border-secondary outline-none transition-all placeholder:text-outline-variant"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors"
                    >
                      <span className="material-symbols-outlined">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center gap-2 py-1">
                  <input
                    id="remember"
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded border border-outline-variant text-primary focus:ring-primary cursor-pointer"
                  />
                  <label
                    htmlFor="remember"
                    className="text-sm text-on-surface-variant select-none cursor-pointer"
                  >
                    Remember this device for 30 days
                  </label>
                </div>

                {/* Login Button */}
                <button
                  type="submit"
                  className="w-full py-4 bg-primary text-on-primary font-bold rounded-xl shadow-lg hover:shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group mt-6"
                >
                  <span>Login to Dashboard</span>
                  <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </button>

                {/* Secondary Option */}
                <div className="pt-4 flex flex-col gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-outline-variant" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-surface-container-lowest px-2 text-outline">
                        or access via SSO
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="w-full py-3 border border-outline-variant rounded-xl hover:bg-surface-container-high transition-colors font-medium text-on-surface flex items-center justify-center gap-2"
                  >
                    <span>Microsoft Azure SSO</span>
                  </button>
                </div>
              </form>

              <footer className="mt-8 text-center">
                <p className="text-xs text-outline leading-relaxed">
                  © 2024 Serviq Lumina. ZATCA Compliant FM Solutions.
                  <br />
                  By logging in, you agree to our{' '}
                  <a href="#" className="underline hover:text-primary transition-colors">
                    Security Policy
                  </a>
                  .
                </p>
              </footer>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Space */}
      <footer className="w-full flex flex-col md:flex-row justify-between items-center px-8 py-4 gap-4 border-t border-outline-variant mt-auto">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <span className="text-primary text-lg font-bold">Serviq Lumina</span>
          <div className="flex gap-4">
            <a
              className="text-on-surface-variant text-sm hover:text-secondary transition-colors"
              href="#"
            >
              Privacy Policy
            </a>
            <a
              className="text-on-surface-variant text-sm hover:text-secondary transition-colors"
              href="#"
            >
              Terms of Service
            </a>
            <a
              className="text-on-surface-variant text-sm hover:text-secondary transition-colors"
              href="#"
            >
              Contact Support
            </a>
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
