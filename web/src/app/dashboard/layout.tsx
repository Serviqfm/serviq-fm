import Sidebar from '@/components/Sidebar'
import { LanguageProvider } from '@/context/LanguageContext'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#F8FAFC' }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', fontFamily: "'DM Sans', sans-serif" }}>
          {children}
        </main>
      </div>
    </LanguageProvider>
  )
}