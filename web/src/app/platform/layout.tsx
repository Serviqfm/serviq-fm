import PlatformSidebar from '@/components/layout/PlatformSidebar'

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-surface">
      <PlatformSidebar />
      <main className="flex-1 min-w-0">
        <div className="h-1 w-full bg-error"></div>
        {children}
      </main>
    </div>
  )
}
