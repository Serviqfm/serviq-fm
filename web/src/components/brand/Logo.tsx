/**
 * ServiqFM <Logo /> component (React / Next.js)
 * ─────────────────────────────────────────────
 * One component, four variants. Drop-in replacement for any existing logo
 * markup on the site.
 *
 * Usage examples:
 *
 *   import { Logo } from '@/components/brand/Logo';
 *
 *   <Logo />                              // primary full-color, 160px
 *   <Logo variant="icon" size={48} />     // icon only, 48×48
 *   <Logo variant="white" />              // for dark backgrounds
 *   <Logo variant="navy" />               // single-color silhouette
 *   <Logo href="/" />                     // wrap in a link to the homepage
 *
 * The component renders the SVG inline by referencing files in /public/brand/.
 * If you'd rather use <img> tags, pass `as="img"`.
 */

import React from 'react';

type Variant = 'primary' | 'icon' | 'white' | 'navy';

interface LogoProps {
  /** Which logo variant to render. */
  variant?: Variant;
  /** Width in pixels (height auto-scales for non-icon variants). */
  size?: number;
  /** Optional className to extend styling. */
  className?: string;
  /** If provided, wraps the logo in an <a>. */
  href?: string;
  /** Accessible label. Defaults to "ServiqFM". */
  alt?: string;
  /** Force <img> rendering instead of inline SVG reference. */
  as?: 'img';
}

const SRC: Record<Variant, { src: string; aspect: number }> = {
  // aspect = width / height
  primary: { src: '/brand/serviqfm-logo-horizontal.svg', aspect: 1040 / 280 },
  white:   { src: '/brand/serviqfm-logo-horizontal-white.png', aspect: 1040 / 280 },
  navy:    { src: '/brand/serviqfm-logo-horizontal-navy.png',  aspect: 1040 / 280 },
  icon:    { src: '/brand/serviqfm-icon.svg', aspect: 1 },
};

export function Logo({
  variant = 'primary',
  size = 160,
  className = '',
  href,
  alt = 'ServiqFM',
}: LogoProps) {
  const { src, aspect } = SRC[variant];
  const width  = size;
  const height = Math.round(size / aspect);

  const img = (
    // Plain <img> keeps the component framework-agnostic. If you'd rather
    // use next/image for the raster variants, swap this in your app.
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={{ display: 'block', height: 'auto' }}
      decoding="async"
    />
  );

  if (href) {
    return (
      <a
        href={href}
        aria-label={alt}
        style={{ display: 'inline-block', lineHeight: 0 }}
      >
        {img}
      </a>
    );
  }

  return img;
}

export default Logo;
