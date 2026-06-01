import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { markdownToHtml } from '@/lib/markdown'
import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'

export const metadata = { title: 'Terms of Service' }

export default function TermsPage() {
  const md = readFileSync(join(process.cwd(), 'src/content/terms-of-service.md'), 'utf8')
  const html = markdownToHtml(md)
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Logo href="/" size={130} />
          <Link href="/" className="text-sm text-on-surface-variant hover:text-primary">← Home</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 text-on-surface" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
