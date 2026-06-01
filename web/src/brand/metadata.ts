/**
 * ServiqFM — Next.js metadata (App Router)
 * ────────────────────────────────────────
 * Copy this `metadata` export into your root layout, e.g.:
 *
 *   // app/layout.tsx
 *   import { metadata as brandMetadata } from '@/brand/metadata';
 *   export const metadata = brandMetadata;
 *
 * OR if you prefer to merge it with your own metadata:
 *
 *   export const metadata: Metadata = {
 *     ...brandMetadata,
 *     title: 'My custom title',
 *   };
 *
 * For the Pages Router or other frameworks, use the equivalent <Head> tags
 * shown in `head-snippet.html`.
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Serviq FM — Facility Management Platform',
    template: '%s · Serviq FM',
  },
  description:
    'The bilingual facility management platform built for Saudi Arabia. ' +
    'Arabic-first. Mobile-first. Priced in SAR.',
  applicationName: 'Serviq FM',
  themeColor: '#182848',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Serviq FM — Facility Management for Saudi Arabia',
    description:
      'Arabic-first, mobile-first facility management. Work orders, asset tracking, ' +
      'preventive maintenance, and ZATCA-compliant invoicing.',
    url: 'https://serviqfm.com',
    siteName: 'Serviq FM',
    images: [
      {
        url: '/brand/open-graph-1200x630.png',
        width: 1200,
        height: 630,
        alt: 'Serviq FM — Facility Management Services',
      },
    ],
    locale: 'en_US',
    alternateLocale: 'ar_SA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Serviq FM — Facility Management for Saudi Arabia',
    description: 'Arabic-first, mobile-first facility management.',
    images: ['/brand/open-graph-1200x630.png'],
  },
};
