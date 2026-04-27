import Sidebar from '@/components/Sidebar'
import { LanguageProvider } from '@/context/LanguageContext'
import { F } from '@/lib/brand'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#F8FAFC' }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', fontFamily: F.en }}>
          {children}
        </main>
      </div>
    </LanguageProvider>
  )
}