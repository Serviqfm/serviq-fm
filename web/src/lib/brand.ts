// ── Serviq-FM Brand Constants ──────────────────────────────────────────────

export const C = {
  navy:       '#1E2D4E',
  teal:       '#6DCFB0',
  blue:       '#1A7FC1',
  mid:        '#3AAECC',
  lightTeal:  '#B8DDD8',
  pageBg:     '#F8FAFC',
  white:      '#ffffff',
  border:     '#E8ECF0',
  textDark:   '#1E2D4E',
  textMid:    '#4A5568',
  textLight:  '#A0B0BF',
  danger:     '#C62828',
  warning:    '#F57F17',
  success:    '#2E7D32',
  dangerBg:   '#FEE2E2',
  dangerBorder: '#FECACA',
  gradient:   'linear-gradient(135deg, #6DCFB0, #3AAECC, #1A7FC1)',
} as const

export const F = {
  en: 'DM Sans, sans-serif',
  ar: 'Readex Pro, sans-serif',
} as const

// Reusable style helpers
export const cardStyle = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '1.25rem',
} as const

export const pageStyle = {
  padding: '2rem',
  maxWidth: 1200,
  margin: '0 auto',
} as const

export const primaryBtn = {
  background: C.navy,
  color: C.white,
  border: 'none',
  borderRadius: 8,
  padding: '9px 20px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: 14,
  fontFamily: F.en,
} as const

export const secondaryBtn = {
  background: C.white,
  color: C.navy,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '9px 20px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: 14,
  fontFamily: F.en,
} as const

export const dangerBtn = {
  background: C.dangerBg,
  color: C.danger,
  border: `1px solid ${C.dangerBorder}`,
  borderRadius: 8,
  padding: '9px 20px',
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: 14,
  fontFamily: F.en,
} as const

export const tableHeaderStyle = {
  background: C.pageBg,
  borderBottom: `1px solid ${C.border}`,
} as const

export const tableHeaderCell = {
  padding: '10px 16px',
  fontSize: 11,
  fontWeight: 600,
  color: C.textLight,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  textAlign: 'left' as const,
  fontFamily: F.en,
} as const

export const tableCell = {
  padding: '14px 16px',
  fontSize: 13,
  color: C.textMid,
  borderBottom: `1px solid ${C.border}`,
  fontFamily: F.en,
} as const

export const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 14,
  fontFamily: F.en,
  color: C.textDark,
  background: C.white,
  boxSizing: 'border-box' as const,
} as const

export const labelStyle = {
  display: 'block' as const,
  fontSize: 12,
  fontWeight: 600,
  color: C.textMid,
  marginBottom: 6,
  fontFamily: F.en,
} as const

export const sectionCard = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: '1.5rem',
  marginBottom: '1.5rem',
} as const

export const pageTitle = {
  fontSize: 22,
  fontWeight: 700,
  color: C.navy,
  margin: 0,
  fontFamily: F.en,
} as const

export const pageSubtitle = {
  fontSize: 13,
  color: C.textLight,
  margin: '4px 0 0',
  fontFamily: F.en,
} as const
