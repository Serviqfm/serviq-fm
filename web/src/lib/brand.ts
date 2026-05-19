// src/lib/brand.ts

// ── Legacy Brand Constants (for backward compatibility) ──────────────────────

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

// ── Lumina Brand Constants ──────────────────────────────────────────────────

export const LUMINA_COLORS = {
  // Primary brand colors
  primary: '#006b54',
  onPrimary: '#ffffff',
  primaryContainer: '#6dcfb0',
  onPrimaryContainer: '#005744',
  inversePrimary: '#76d8b9',

  // Secondary colors
  secondary: '#00677d',
  onSecondary: '#ffffff',
  secondaryContainer: '#75e0ff',
  onSecondaryContainer: '#006277',

  // Tertiary colors
  tertiary: '#4f5e82',
  onTertiary: '#ffffff',
  tertiaryContainer: '#aebde6',
  onTertiaryContainer: '#3d4c6f',

  // Error colors
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // Surface colors (backgrounds)
  surface: '#f7f9fb',
  surfaceDim: '#d8dadc',
  surfaceBright: '#f7f9fb',
  onSurface: '#191c1e',
  onSurfaceVariant: '#3e4944',
  inverseSurface: '#2d3133',
  inverseOnSurface: '#eff1f3',

  // Outline and dividers
  outline: '#6e7a74',
  outlineVariant: '#bdc9c3',

  // Backgrounds
  background: '#f7f9fb',
  onBackground: '#191c1e',

  // Surface variants
  surfaceVariant: '#e0e3e5',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f2f4f6',
  surfaceContainer: '#eceef0',
  surfaceContainerHigh: '#e6e8ea',
  surfaceContainerHighest: '#e0e3e5',

  // Semantic colors (status indicators)
  success: '#2E7D32',
  warning: '#F57F17',
}

export const LUMINA_TYPOGRAPHY = {
  displayLarge: {
    fontFamily: 'DM Sans',
    fontSize: '48px',
    fontWeight: '700',
    lineHeight: '1.1',
    letterSpacing: '-0.02em',
  },
  headlineH1: {
    fontFamily: 'DM Sans',
    fontSize: '32px',
    fontWeight: '700',
    lineHeight: '1.2',
  },
  headlineH1Arabic: {
    fontFamily: 'Readex Pro',
    fontSize: '32px',
    fontWeight: '600',
    lineHeight: '1.4',
  },
  bodyMd: {
    fontFamily: 'DM Sans',
    fontSize: '16px',
    fontWeight: '400',
    lineHeight: '1.6',
  },
  bodyMdArabic: {
    fontFamily: 'Readex Pro',
    fontSize: '15px',
    fontWeight: '300',
    lineHeight: '1.8',
  },
  labelCaps: {
    fontFamily: 'DM Sans',
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '1.0',
    letterSpacing: '0.05em',
  },
}

export const LUMINA_SPACING = {
  unit: '4px',
  sm: '8px',
  md: '16px',
  lg: '32px',
  gutter: '24px',
  margin: '32px',
  containerMax: '1440px',
}

export const LUMINA_RADII = {
  sm: '0.25rem',
  DEFAULT: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  full: '9999px',
}
