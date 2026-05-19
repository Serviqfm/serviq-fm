import { type ReactNode } from 'react'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="m-0 p-0 bg-background">
        <header className="bg-surface border-b border-outline-variant px-8 h-14 flex items-center">
          <a href="/" className="inline-flex items-center gap-2.5 no-underline">
            <div className="w-[34px] h-[34px] rounded-[9px] bg-primary flex items-center justify-center">
              <span className="text-base font-extrabold text-on-primary">S</span>
            </div>
            <span className="text-base font-bold text-on-surface">
              Serviq<span className="text-secondary">FM</span>
            </span>
          </a>
        </header>
        {children}
      </body>
    </html>
  )
}
