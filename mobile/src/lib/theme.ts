export const colors = {
  primary: '#1a1a2e',
  primaryLight: '#16213e',
  accent: '#0f3460',
  white: '#ffffff',
  background: '#f8f9fa',
  card: '#ffffff',
  border: '#e9ecef',
  text: '#212529',
  textSecondary: '#6c757d',
  textLight: '#adb5bd',
  success: '#2e7d32',
  successLight: '#e8f5e9',
  warning: '#f57f17',
  warningLight: '#fff8e1',
  error: '#c62828',
  errorLight: '#fce4ec',
  info: '#0d47a1',
  infoLight: '#e3f2fd',

  priority: {
    critical: { bg: '#fce4ec', text: '#c62828' },
    high:     { bg: '#fff3e0', text: '#e65100' },
    medium:   { bg: '#fff8e1', text: '#f57f17' },
    low:      { bg: '#e8f5e9', text: '#2e7d32' },
  },

  status: {
    new:         { bg: '#e3f2fd', text: '#0d47a1' },
    assigned:    { bg: '#e8eaf6', text: '#283593' },
    in_progress: { bg: '#fff8e1', text: '#f57f17' },
    on_hold:     { bg: '#fce4ec', text: '#880e4f' },
    completed:   { bg: '#e8f5e9', text: '#1b5e20' },
    closed:      { bg: '#f5f5f5', text: '#424242' },
  },
}

export const fonts = {
  regular: { fontWeight: '400' as const },
  medium:  { fontWeight: '500' as const },
  semibold: { fontWeight: '600' as const },
  bold:    { fontWeight: '700' as const },
}

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, full: 999,
}

export const shadow = {
  sm: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  md: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
}