/**
 * ServiqFM Brand — Tailwind theme extension
 * ─────────────────────────────────────────
 * Merge this into your project's tailwind.config.js.
 *
 * USAGE A — Tailwind v3 / classic config (Next.js, Vite, CRA):
 *
 *   // tailwind.config.js
 *   const brand = require('./src/brand/tailwind.brand');
 *   module.exports = {
 *     content: ['./app/...', './pages/...', './components/...'],
 *     theme: {
 *       extend: brand.theme.extend,
 *     },
 *     plugins: [],
 *   };
 *
 * USAGE B — Tailwind v4 CSS-first config (using @theme directive):
 *
 *   Do NOT use this file. Instead, the brand.css already declares all
 *   tokens as CSS variables — Tailwind v4 will pick them up automatically.
 *
 * After merging, you get utilities like:
 *   bg-brand-navy   text-brand-blue   border-brand-sky-light
 *   shadow-brand-md font-arabic       rounded-brand-lg
 */

const { colors, fonts, shadow, radius } = require('./tokens.js');

module.exports = {
  theme: {
    extend: {
      colors: {
        'brand-navy':      colors.navy,
        'brand-black':     colors.black,
        'brand-blue':      colors.blue,
        'brand-teal':      colors.teal,
        'brand-sky-light': colors.skyLight,
        'brand-sky-pale':  colors.skyPale,
        'brand-grey':      colors.grey,
        'brand-text':      colors.textBody,
        'brand-muted':     colors.textMuted,
      },
      fontFamily: {
        sans:   fonts.sans.split(',').map(s => s.trim().replace(/['"]/g, '')),
        arabic: fonts.arabic.split(',').map(s => s.trim().replace(/['"]/g, '')),
        mono:   fonts.mono.split(',').map(s => s.trim().replace(/['"]/g, '')),
      },
      boxShadow: {
        'brand-sm': shadow.sm,
        'brand-md': shadow.md,
        'brand-lg': shadow.lg,
        'brand-xl': shadow.xl,
      },
      borderRadius: {
        'brand-sm':  radius.sm,
        'brand-md':  radius.md,
        'brand-lg':  radius.lg,
        'brand-xl':  radius.xl,
        'brand-2xl': radius['2xl'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #182848 0%, #1C5078 60%, #2898C8 100%)',
      },
    },
  },
};
