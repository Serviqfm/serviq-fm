import Link from 'next/link'

export default function LoginPage() {
  return (
    <div className="star-pattern bg-background text-on-surface min-h-screen flex flex-col">

      {/* Header */}
      <header className="w-full flex justify-center py-8 px-8">
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-3xl font-bold text-primary tracking-tight">Serviq Lumina</h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">Precision Facility Management</p>
        </div>
      </header>

      {/* Portal cards */}
      <main className="flex-grow flex items-center justify-center px-8 py-8">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Client Portal */}
          <Link href="/login/client" className="group relative bg-surface-container-lowest border border-outline-variant rounded-xl p-8 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,107,84,0.1)] hover:-translate-y-1 flex flex-col items-center text-center no-underline">
            <div className="mb-6 w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-300">
              <span className="material-symbols-outlined text-4xl">business_center</span>
            </div>
            <h2 className="text-2xl font-bold text-on-surface mb-1">Client Portal</h2>
            <h3 className="text-xl font-semibold text-primary mb-6" style={{ fontFamily: 'Readex Pro, sans-serif' }}>بوابة العملاء</h3>
            <p className="text-on-surface-variant mb-6 max-w-[280px] text-sm leading-relaxed">
              Request maintenance, track orders, and view invoices with our transparent self-service platform.
            </p>
            <ul className="space-y-2 mb-6 text-left w-full px-4">
              {['Real-time Ticket Tracking','Billing & Payment History','Direct Support Access'].map(item => (
                <li key={item} className="flex items-center gap-2 text-on-surface-variant text-sm">
                  <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  {item}
                </li>
              ))}
            </ul>
            <button className="mt-auto w-full py-3 px-6 bg-primary text-on-primary font-bold rounded-lg hover:shadow-lg hover:bg-primary/90 active:scale-95 transition-all cursor-pointer">
              Access Portal
            </button>
          </Link>

          {/* Employee Portal */}
          <Link href="/login/employee" className="group relative bg-surface-container-lowest border border-outline-variant rounded-xl p-8 transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,103,125,0.1)] hover:-translate-y-1 flex flex-col items-center text-center no-underline">
            <div className="mb-6 w-20 h-20 rounded-full bg-secondary/10 flex items-center justify-center text-secondary group-hover:scale-110 transition-transform duration-300">
              <span className="material-symbols-outlined text-4xl">engineering</span>
            </div>
            <h2 className="text-2xl font-bold text-on-surface mb-1">Employee Portal</h2>
            <h3 className="text-xl font-semibold text-secondary mb-6" style={{ fontFamily: 'Readex Pro, sans-serif' }}>بوابة الموظفين</h3>
            <p className="text-on-surface-variant mb-6 max-w-[280px] text-sm leading-relaxed">
              Manage work orders, assets, and team operations through our specialized technical dashboard.
            </p>
            <ul className="space-y-2 mb-6 text-left w-full px-4">
              {['Work Order Lifecycle','Asset Performance Monitoring','Inventory & Logistics'].map(item => (
                <li key={item} className="flex items-center gap-2 text-on-surface-variant text-sm">
                  <span className="material-symbols-outlined text-secondary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  {item}
                </li>
              ))}
            </ul>
            <button className="mt-auto w-full py-3 px-6 bg-secondary text-on-secondary font-bold rounded-lg hover:shadow-lg hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer">
              Team Login
            </button>
          </Link>

        </div>
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-low border-t border-outline-variant py-6 px-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <span className="font-bold text-primary text-lg">Serviq Lumina</span>
          <span className="text-outline-variant">|</span>
          <p className="text-on-surface-variant text-sm">© 2024 ZATCA Compliant FM Solutions.</p>
        </div>
        <div className="flex gap-6">
          <a href="#" className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors">Privacy Policy</a>
          <a href="#" className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant hover:text-primary transition-colors">Support Portal</a>
        </div>
      </footer>

    </div>
  )
}
