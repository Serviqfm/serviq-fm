content = """import Sidebar from '@/components/Sidebar'
import { LanguageProvider } from '@/context/LanguageContext'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f7f7f5' }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </LanguageProvider>
  )
}"""

with open('src/app/dashboard/layout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Layout fixed')