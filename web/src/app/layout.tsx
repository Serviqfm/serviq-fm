import "./globals.css";
import { DM_Sans, Readex_Pro } from 'next/font/google'
import { metadata as brandMetadata } from '@/brand/metadata'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

const readexPro = Readex_Pro({
  subsets: ['latin', 'arabic'],
  weight: ['400', '600', '700'],
  display: 'swap',
})

export const metadata = brandMetadata

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${dmSans.className} ${readexPro.className}`}>
      <body>{children}</body>
    </html>
  );
}
