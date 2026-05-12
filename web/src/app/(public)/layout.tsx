import { type ReactNode } from 'react'
import { C, F, LUMINA_COLORS } from '@/lib/brand'

const gradH = 'linear-gradient(90deg, #6DCFB0 0%, #3AAECC 50%, #1A7FC1 100%)'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, fontFamily: F.en, background: LUMINA_COLORS.background }}>
        <header style={{
          background: LUMINA_COLORS.surfaceContainerLowest,
          borderBottom: `1px solid ${LUMINA_COLORS.outlineVariant}`,
          padding: '0 32px',
          height: 56,
          display: 'flex',
          alignItems: 'center',
        }}>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: LUMINA_COLORS.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, fontWeight: 800, fontFamily: F.en, background: gradH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>S</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: LUMINA_COLORS.primary, fontFamily: F.en }}>
              Serviq<span style={{ background: gradH, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>FM</span>
            </span>
          </a>
        </header>
        {children}
      </body>
    </html>
  )
}
