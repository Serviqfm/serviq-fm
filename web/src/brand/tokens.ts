/**
 * ServiqFM Brand Tokens
 * ─────────────────────
 * Single source of truth for the ServiqFM visual identity.
 * Import this file anywhere you need brand colors, spacing, or typography.
 * Do NOT hardcode brand colors elsewhere — always import from here.
 *
 * Source artwork: ServiqFM_Logo_v2.pdf
 * Generated: June 2026
 */

/* ─────────────────────────── COLORS ─────────────────────────── */

export const colors = {
  // Primary brand
  navy:    '#182848',  // Primary wordmark, headings, dark backgrounds
  black:   '#000000',  // 'FM' wordmark, body text on light
  blue:    '#2898C8',  // Center mark, accents, links, CTAs
  teal:    '#48B8C0',  // Icon mid-tone, highlights, chart series

  // Supporting / surfaces
  skyLight: '#A0D0E0', // Secondary surfaces, tags, hover states
  skyPale:  '#E0F0F8', // Soft backgrounds, dividers, table fills

  // Text & neutrals
  grey:    '#A0B0B8',  // Subtitle / meta text (NOT for body — too light)
  textBody: '#303A4E', // Body copy on white
  textMuted: '#6A7488',// Captions, helper text
  white:   '#FFFFFF',

  // Semantic (derived from the palette)
  success: '#48B8C0',  // = teal
  info:    '#2898C8',  // = blue
  warning: '#E8A23C',  // warm complement to navy
  danger:  '#C8324C',  // warm complement to teal
} as const;

/* ─────────────────────────── TYPOGRAPHY ─────────────────────────── */

export const fonts = {
  // Latin — use Inter as the primary brand sans
  sans:    "'Inter', 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif",
  // Arabic — pair with Tajawal, weight-matched
  arabic:  "'Tajawal', 'Noto Sans Arabic', system-ui, sans-serif",
  // Mono — for code, hex values, IDs
  mono:    "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
} as const;

export const fontSizes = {
  xs:   '0.75rem',   // 12px — captions, meta
  sm:   '0.875rem',  // 14px — small body
  base: '1rem',      // 16px — body
  lg:   '1.125rem',  // 18px — large body
  xl:   '1.25rem',   // 20px — small headings
  '2xl':'1.5rem',    // 24px — H3
  '3xl':'1.875rem',  // 30px — H2
  '4xl':'2.25rem',   // 36px — H1
  '5xl':'3rem',      // 48px — display
  '6xl':'3.75rem',   // 60px — hero
} as const;

export const fontWeights = {
  regular: 400,
  medium:  500,
  semibold: 600,
  bold:    700,
} as const;

/* ─────────────────────────── SPACING & RADIUS ─────────────────────────── */

export const radius = {
  none: '0',
  sm:   '0.25rem',  // 4px
  md:   '0.5rem',   // 8px — default
  lg:   '0.75rem',  // 12px
  xl:   '1rem',     // 16px
  '2xl':'1.5rem',   // 24px — cards
  full: '9999px',
} as const;

export const shadow = {
  // Subtle navy-tinted shadows for brand consistency
  sm: '0 1px 2px 0 rgba(24, 40, 72, 0.05)',
  md: '0 4px 6px -1px rgba(24, 40, 72, 0.08), 0 2px 4px -2px rgba(24, 40, 72, 0.04)',
  lg: '0 10px 15px -3px rgba(24, 40, 72, 0.10), 0 4px 6px -4px rgba(24, 40, 72, 0.06)',
  xl: '0 20px 25px -5px rgba(24, 40, 72, 0.12), 0 8px 10px -6px rgba(24, 40, 72, 0.08)',
} as const;

/* ─────────────────────────── ASSET PATHS ─────────────────────────── */

/**
 * Paths assume the contents of /public have been copied to the site's
 * /public folder (Next.js, Vite, CRA) or web root.
 * Reference them with a leading slash.
 */
export const assets = {
  // Vector — preferred for web
  logoSvg:   '/brand/serviqfm-logo-horizontal.svg',
  iconSvg:   '/brand/serviqfm-icon.svg',

  // Raster fallbacks
  logoPng:   '/brand/serviqfm-logo-horizontal.png',     // 1600 wide
  logoWhitePng: '/brand/serviqfm-logo-horizontal-white.png',
  iconPng:   '/brand/serviqfm-icon.png',                 // 512 square

  // Favicon set (place at web root, not in /brand)
  favicon:   '/favicon.ico',
  manifest:  '/site.webmanifest',

  // Social
  ogImage:   '/brand/open-graph-1200x630.png',
} as const;

/* ─────────────────────────── BRAND METADATA ─────────────────────────── */

export const brand = {
  name:       'ServiqFM',
  fullName:   'Serviq FM',
  nameArabic: 'سيرفيك',
  tagline:    'Facility Management Services',
  taglineArabic: 'خدمات إدارة المرافق',
  themeColor: colors.navy,
  bgColor:    colors.white,
} as const;

/* ─────────────────────────── TYPE EXPORTS ─────────────────────────── */

export type BrandColor = keyof typeof colors;
export type FontSize  = keyof typeof fontSizes;
export type Radius    = keyof typeof radius;
