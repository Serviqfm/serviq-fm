/** @type {import('tailwindcss').Config} */

// ServiqFM Brand Design System — Tailwind Config
// Fonts: DM Sans (English) · Readex Pro (Arabic)
// Palette: teal #6DCFB0 → teal-blue #3AAECC → blue #1A7FC1
// Version: 2.0 | 2026

module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {

      // ─── Font Families ───────────────────────────────────────────
      fontFamily: {
        sans:   ['DM Sans',    'ui-sans-serif', 'system-ui', 'sans-serif'],
        arabic: ['Readex Pro', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono:   ['ui-monospace', 'monospace'],
      },

      // ─── Brand Colours ────────────────────────────────────────────
      colors: {
        brand: {
          navy:          '#1E2D4E',
          'navy-light':  '#E8ECF2',
          teal:          '#6DCFB0',   // primary gradient start
          'teal-mid':    '#3AAECC',   // gradient mid
          'teal-light':  '#B8DDD8',   // outer glow / backgrounds
          'teal-bg':     '#E8F7F3',   // surface tint
          blue:          '#1A7FC1',   // gradient anchor / CTA
          'blue-light':  '#E6F1FB',   // surface tint
          muted:         '#A0B0BF',
          offwhite:      '#F8FAFC',
        },

        // Semantic colours
        status: {
          success:         '#22C997',
          'success-light': '#E8F7F3',
          'success-text':  '#0F6E56',
          warning:         '#F5A623',
          'warning-light': '#FFF4E0',
          'warning-text':  '#854F0B',
          danger:          '#E24B4A',
          'danger-light':  '#FCEBEB',
          'danger-text':   '#A32D2D',
          info:            '#1A7FC1',
          'info-light':    '#E6F1FB',
          'info-text':     '#185FA5',
          neutral:         '#A0B0BF',
          'neutral-light': '#F1F4F6',
        },
      },

      // ─── Typography Scale ─────────────────────────────────────────
      fontSize: {
        'ui-label': ['11px', { lineHeight: '1.4', letterSpacing: '0.1em',  fontWeight: '500' }],
        caption:    ['12px', { lineHeight: '1.5' }],
        'body-sm':  ['13px', { lineHeight: '1.6' }],
        body:       ['14px', { lineHeight: '1.7' }],
        'body-ar':  ['14px', { lineHeight: '1.9' }],  // Arabic needs more vertical space
        h3:         ['17px', { lineHeight: '1.5', fontWeight: '500' }],
        h2:         ['22px', { lineHeight: '1.4', fontWeight: '500' }],
        h1:         ['28px', { lineHeight: '1.3', fontWeight: '600' }],
        display:    ['36px', { lineHeight: '1.2', fontWeight: '600' }],
      },

      // ─── Font Weight mapping ──────────────────────────────────────
      // EN (DM Sans):    300 · 400 · 500 · 600
      // AR (Readex Pro): 200 · 300 · 400 · 500 · 600 · 700
      // Mapping: EN-500 → AR-600 | EN-600 → AR-700
      fontWeight: {
        light:     '300',
        regular:   '400',
        medium:    '500',
        semibold:  '600',
        bold:      '700',
      },

      // ─── Spacing Scale ────────────────────────────────────────────
      spacing: {
        xs:    '4px',
        sm:    '8px',
        '12':  '12px',
        md:    '16px',
        lg:    '24px',
        xl:    '32px',
        '2xl': '48px',
        '3xl': '64px',
      },

      // ─── Border Radius ────────────────────────────────────────────
      borderRadius: {
        input:  '4px',
        btn:    '8px',
        card:   '12px',
        modal:  '16px',
        pill:   '24px',
        full:   '9999px',
      },

      // ─── Shadows ─────────────────────────────────────────────────
      boxShadow: {
        focus: '0 0 0 3px rgba(58, 174, 204, 0.25)',
        none:  'none',
      },
    },
  },
  plugins: [],
};
