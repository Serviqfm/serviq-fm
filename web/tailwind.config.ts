import type { Config } from "tailwindcss";

const LUMINA_COLORS = {
  primary: '#006b54',
  'on-primary': '#ffffff',
  'primary-container': '#6dcfb0',
  'on-primary-container': '#005744',
  'inverse-primary': '#76d8b9',

  secondary: '#00677d',
  'on-secondary': '#ffffff',
  'secondary-container': '#75e0ff',
  'on-secondary-container': '#006277',

  tertiary: '#4f5e82',
  'on-tertiary': '#ffffff',
  'tertiary-container': '#aebde6',
  'on-tertiary-container': '#3d4c6f',

  error: '#ba1a1a',
  'on-error': '#ffffff',
  'error-container': '#ffdad6',
  'on-error-container': '#93000a',

  surface: '#f7f9fb',
  'surface-dim': '#d8dadc',
  'surface-bright': '#f7f9fb',
  'surface-container-lowest': '#ffffff',
  'surface-container-low': '#f2f4f6',
  'surface-container': '#eceef0',
  'surface-container-high': '#e6e8ea',
  'surface-container-highest': '#e0e3e5',
  'on-surface': '#191c1e',
  'on-surface-variant': '#3e4944',
  'inverse-surface': '#2d3133',
  'inverse-on-surface': '#eff1f3',

  outline: '#6e7a74',
  'outline-variant': '#bdc9c3',

  background: '#f7f9fb',
  'on-background': '#191c1e',
  'surface-variant': '#e0e3e5',
};

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: LUMINA_COLORS,
      spacing: {
        'unit': '0.25rem',
        'sm': '0.5rem',
        'md': '1rem',
        'lg': '2rem',
        'gutter': '1.5rem',
        'margin': '2rem',
      },
      borderRadius: {
        'sm': '0.25rem',
        'DEFAULT': '0.5rem',
        'md': '0.75rem',
        'lg': '1rem',
        'xl': '1.5rem',
      },
      fontFamily: {
        'sans': ['"DM Sans"', 'sans-serif'],
        'arabic': ['"Readex Pro"', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }],
        'headline-h1': ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        'body-md': ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'label-caps': ['12px', { lineHeight: '1', fontWeight: '600', letterSpacing: '0.05em' }],
      },
      maxWidth: {
        'container': '1440px',
      },
    },
  },
  plugins: [],
};
export default config;
