/**
 * ServiqFM <Logo /> component (React / Next.js)
 * ─────────────────────────────────────────────
 * Renders the brand icon (8-pointed star mark) plus the bold "ServiqFM"
 * wordmark beside it. The icon image lives at /public/brand/serviqfm-icon.png
 * (or .svg) — drop the new artwork there and every Logo on the site updates.
 *
 * Variants:
 *   primary  — icon + navy "Serviq" + black "FM"  (default, light backgrounds)
 *   icon     — square mark only, no text
 *   white    — icon + white wordmark               (dark backgrounds)
 *   navy     — icon + all-navy wordmark            (single-tone surfaces)
 *
 * Usage:
 *   <Logo />                            // 160px wide
 *   <Logo href="/" size={140} />        // wraps in a link
 *   <Logo variant="icon" size={32} />   // icon-only, for collapsed sidebar
 *   <Logo variant="white" size={120} /> // for navy/dark hero sections
 */

import React from 'react';

type Variant = 'primary' | 'icon' | 'white' | 'navy';

interface LogoProps {
  variant?: Variant;
  /** Total width of icon + wordmark in pixels. The icon is ~26% of this. */
  size?: number;
  className?: string;
  href?: string;
  alt?: string;
}

const ICON_SRC = '/brand/serviqfm-icon.png';

// Tuned so the icon and wordmark feel balanced at any size.
const ICON_RATIO = 0.32;

export function Logo({
  variant = 'primary',
  size = 160,
  className = '',
  href,
  alt = 'ServiqFM',
}: LogoProps) {
  const iconPx = Math.round(size * (variant === 'icon' ? 1 : ICON_RATIO));
  const wordmarkFontPx = Math.round(size * 0.22);

  // Colour scheme per variant.
  const serviqColor =
    variant === 'white' ? '#FFFFFF' :
    variant === 'navy'  ? '#182848' :
                          '#182848'; // primary
  const fmColor =
    variant === 'white' ? '#FFFFFF' :
    variant === 'navy'  ? '#182848' :
                          '#000000'; // primary

  const inner = (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: variant === 'icon' ? 0 : Math.round(size * 0.06),
        lineHeight: 1,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ICON_SRC}
        alt={alt}
        width={iconPx}
        height={iconPx}
        style={{ display: 'block', width: iconPx, height: iconPx, flexShrink: 0 }}
        decoding="async"
      />
      {variant !== 'icon' && (
        <span
          aria-hidden="true"
          style={{
            fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
            fontWeight: 800,
            fontSize: wordmarkFontPx,
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: serviqColor }}>Serviq</span>
          <span style={{ color: fmColor }}>FM</span>
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <a
        href={href}
        aria-label={alt}
        style={{ display: 'inline-flex', textDecoration: 'none', lineHeight: 0 }}
      >
        {inner}
      </a>
    );
  }

  return inner;
}

export default Logo;
