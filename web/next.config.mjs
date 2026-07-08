/** @type {import('next').NextConfig} */

// DV-18 — Content-Security-Policy + security headers.
// Origins were enumerated from the running app (recon): Google Fonts (CSS @import),
// Supabase (REST/Auth/Storage + public image URLs), api.qrserver.com (asset QR tab,
// removed by DV-27), api.mymemory.translated.net (Translate button). 'unsafe-inline'
// is required for Next's inline hydration scripts and the app's inline style attributes
// (no nonce infrastructure); tightening to nonces is a follow-up.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  ["img-src 'self' data: blob:", supabaseUrl, 'https://api.qrserver.com'].filter(Boolean).join(' '),
  ["connect-src 'self'", supabaseUrl, 'https://api.mymemory.translated.net'].filter(Boolean).join(' '),
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
