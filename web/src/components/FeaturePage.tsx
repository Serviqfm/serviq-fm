import Link from 'next/link'

export type FeaturePageProps = {
  eyebrow: { en: string; ar: string }
  title: { en: string; ar: string }
  description: string
  image: { src: string; alt: string }
  marketing: { en: string; ar: string }
  capabilities: { en: string; ar: string }[]
  audience: { en: string; ar: string }
}

export default function FeaturePage({ eyebrow, title, description, image, marketing, capabilities, audience }: FeaturePageProps) {
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-md border-b border-outline-variant">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ServiqFM_Logo_v2.jpg" alt="ServIQ-FM" style={{ height: 32, width: 'auto' }} />
          </Link>
          <Link href="/" className="text-sm text-on-surface-variant hover:text-primary">← Home</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-secondary mb-4">{eyebrow.en} · {eyebrow.ar}</span>
          <h1 className="text-4xl md:text-5xl font-bold text-on-surface mb-3">{title.en}</h1>
          <p className="text-lg md:text-xl font-semibold text-secondary mb-5" style={{ fontFamily: 'Readex Pro, sans-serif' }} dir="rtl">{title.ar}</p>
          <p className="max-w-2xl mx-auto text-base text-on-surface-variant leading-relaxed">{description}</p>
        </div>

        {/* Screenshot */}
        <div className="rounded-[18px] overflow-hidden shadow-[0_24px_80px_rgba(30,45,78,0.18)] border border-outline-variant mb-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.src} alt={image.alt} style={{ display: 'block', width: '100%', height: 'auto' }} />
        </div>

        {/* Marketing copy */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <blockquote className="bg-surface-container-lowest border-l-4 border-primary rounded-r-[12px] p-6">
            <p className="text-base text-on-surface leading-relaxed whitespace-pre-line">{marketing.en}</p>
          </blockquote>
          <blockquote className="bg-surface-container-lowest border-r-4 border-secondary rounded-l-[12px] p-6" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>
            <p className="text-base text-on-surface leading-relaxed whitespace-pre-line">{marketing.ar}</p>
          </blockquote>
        </div>

        {/* Capabilities */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-on-surface mb-2">Key capabilities</h2>
          <p className="text-sm text-secondary mb-6" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>أبرز الإمكانيات</p>
          <ul className="space-y-3">
            {capabilities.map(c => (
              <li key={c.en} className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="text-sm text-on-surface">{c.en}</div>
                <div className="text-sm text-on-surface-variant md:text-right" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>{c.ar}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* Audience */}
        <section className="bg-primary/5 border border-primary/20 rounded-[12px] p-6 mb-12">
          <h3 className="text-base font-bold text-primary mb-3">Who this helps</h3>
          <p className="text-sm text-on-surface leading-relaxed mb-3">{audience.en}</p>
          <p className="text-sm text-on-surface-variant leading-relaxed" dir="rtl" style={{ fontFamily: 'Readex Pro, sans-serif' }}>{audience.ar}</p>
        </section>

        {/* CTA */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
          <Link href="/#waitlist" className="bg-primary text-on-primary px-6 py-3 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">Join the waitlist</Link>
          <a href="mailto:admin@serviqfm.com?subject=Book%20a%20demo" className="border border-outline-variant text-on-surface px-6 py-3 rounded-xl font-semibold text-sm hover:bg-surface-container-low transition-colors">Book a 20-min demo</a>
        </div>
      </main>
    </div>
  )
}
