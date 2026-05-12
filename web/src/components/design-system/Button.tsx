// src/components/design-system/Button.tsx

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { LUMINA_COLORS, LUMINA_SPACING, LUMINA_RADII } from '@/lib/brand';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  icon?: ReactNode;
  fullWidth?: boolean;
  isLoading?: boolean;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  icon,
  fullWidth = false,
  isLoading = false,
  disabled = false,
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: LUMINA_SPACING.sm,
    borderRadius: LUMINA_RADII.lg,
    border: 'none',
    fontFamily: 'inherit',
    fontWeight: 600,
    cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
    transition: 'all 200ms ease-in-out',
    width: fullWidth ? '100%' : 'auto',
    opacity: disabled || isLoading ? 0.6 : 1,
  };

  const sizeStyles: Record<'sm' | 'md' | 'lg', React.CSSProperties> = {
    sm: {
      padding: `${LUMINA_SPACING.sm} ${LUMINA_SPACING.md}`,
      fontSize: '12px',
      minHeight: '32px',
    },
    md: {
      padding: `${LUMINA_SPACING.md} ${LUMINA_SPACING.lg}`,
      fontSize: '14px',
      minHeight: '40px',
    },
    lg: {
      padding: `12px ${LUMINA_SPACING.lg}`,
      fontSize: '16px',
      minHeight: '48px',
    },
  };

  const variantStyles: Record<'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger', React.CSSProperties> = {
    primary: {
      backgroundColor: LUMINA_COLORS.primary,
      color: LUMINA_COLORS.onPrimary,
      border: `1px solid ${LUMINA_COLORS.primary}`,
    },
    secondary: {
      backgroundColor: LUMINA_COLORS.primaryContainer,
      color: LUMINA_COLORS.onPrimaryContainer,
      border: `1px solid ${LUMINA_COLORS.primaryContainer}`,
    },
    tertiary: {
      backgroundColor: 'transparent',
      color: LUMINA_COLORS.primary,
      border: `1px solid ${LUMINA_COLORS.outline}`,
    },
    ghost: {
      backgroundColor: 'transparent',
      color: LUMINA_COLORS.primary,
      border: 'none',
    },
    danger: {
      backgroundColor: LUMINA_COLORS.error,
      color: LUMINA_COLORS.onError,
      border: `1px solid ${LUMINA_COLORS.error}`,
    },
  };

  const style: React.CSSProperties = {
    ...baseStyles,
    ...sizeStyles[size],
    ...variantStyles[variant],
  };

  return (
    <button
      style={style}
      className={className}
      disabled={disabled || isLoading}
      {...props}
    >
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {children}
      {isLoading && <span>...</span>}
    </button>
  );
}
