import Sidebar from '@/components/Sidebar'
import PlatformImpersonationBanner from '@/components/PlatformImpersonationBanner'
import TenantAnnouncementsBanner from '@/components/TenantAnnouncementsBanner'
import { LanguageProvider } from '@/context/LanguageContext'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <PlatformImpersonationBanner />
      <TenantAnnouncementsBanner />
      <div className="flex min-h-screen bg-surface">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </LanguageProvider>
  )
}