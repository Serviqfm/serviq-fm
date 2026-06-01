/**
 * ServiqFM Brand Tokens (JavaScript version)
 * Mirror of tokens.ts — use this if your project is plain JS or you need
 * to require() the tokens from a build config (e.g. tailwind.config.js).
 */

const colors = {
  navy:    '#182848',
  black:   '#000000',
  blue:    '#2898C8',
  teal:    '#48B8C0',
  skyLight: '#A0D0E0',
  skyPale:  '#E0F0F8',
  grey:    '#A0B0B8',
  textBody: '#303A4E',
  textMuted: '#6A7488',
  white:   '#FFFFFF',
  success: '#48B8C0',
  info:    '#2898C8',
  warning: '#E8A23C',
  danger:  '#C8324C',
};

const fonts = {
  sans:    "'Inter', 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif",
  arabic:  "'Tajawal', 'Noto Sans Arabic', system-ui, sans-serif",
  mono:    "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace",
};

const radius = {
  none: '0',
  sm:   '0.25rem',
  md:   '0.5rem',
  lg:   '0.75rem',
  xl:   '1rem',
  '2xl':'1.5rem',
  full: '9999px',
};

const shadow = {
  sm: '0 1px 2px 0 rgba(24, 40, 72, 0.05)',
  md: '0 4px 6px -1px rgba(24, 40, 72, 0.08), 0 2px 4px -2px rgba(24, 40, 72, 0.04)',
  lg: '0 10px 15px -3px rgba(24, 40, 72, 0.10), 0 4px 6px -4px rgba(24, 40, 72, 0.06)',
  xl: '0 20px 25px -5px rgba(24, 40, 72, 0.12), 0 8px 10px -6px rgba(24, 40, 72, 0.08)',
};

const brand = {
  name: 'ServiqFM',
  fullName: 'Serviq FM',
  nameArabic: 'سيرفيك',
  tagline: 'Facility Management Services',
  taglineArabic: 'خدمات إدارة المرافق',
  themeColor: colors.navy,
  bgColor: colors.white,
};

module.exports = { colors, fonts, radius, shadow, brand };
