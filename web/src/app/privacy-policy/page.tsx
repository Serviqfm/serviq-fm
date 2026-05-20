import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { markdownToHtml } from '@/lib/markdown'
import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — ServIQ-FM' }

export default function PrivacyPolicyPage() {
  const md = readFileSync(join(process.cwd(), 'src/content/privacy-policy.md'), 'utf8')
  const html = markdownToHtml(md)
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-primary font-bold tracking-tight text-2xl hover:opacity-80">Serviq Lumina</Link>
          <Link href="/" className="text-sm text-on-surface-variant hover:text-primary">← Home</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8 text-on-surface" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
