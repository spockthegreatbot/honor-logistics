import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/mobile-nav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          {/* pb-16 prevents content hiding behind mobile bottom nav */}
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — hidden on desktop */}
      <MobileNav />
    </div>
  )
}
