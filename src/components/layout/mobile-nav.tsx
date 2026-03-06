'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Truck, Package, Printer, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'

// Only 5 items — thumb-zone optimised. Settings accessible via sidebar on desktop.
const mobileNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs',      label: 'Jobs',       icon: Truck },
  { href: '/inventory', label: 'Inventory',  icon: Package },
  { href: '/toner',     label: 'Toner',      icon: Printer },
  { href: '/billing',   label: 'Billing',    icon: Receipt },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    // Fixed bottom bar — only visible on mobile (lg:hidden)
    // safe-area-inset-bottom handles iPhone notch / home indicator
    <nav
      className={cn(
        'lg:hidden fixed bottom-0 left-0 right-0 z-30',
        'bg-white border-t border-slate-200',
        'grid grid-cols-5',
        'pb-[env(safe-area-inset-bottom)]',
      )}
      aria-label="Mobile navigation"
    >
      {mobileNavItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-h-[56px]',
              'text-xs font-medium transition-colors active:scale-95',
              isActive
                ? 'text-orange-600'
                : 'text-slate-500 hover:text-slate-800',
            )}
          >
            <Icon
              className={cn(
                'w-5 h-5 flex-shrink-0',
                isActive ? 'text-orange-600' : 'text-slate-400',
              )}
              strokeWidth={isActive ? 2.5 : 1.8}
            />
            <span className="leading-none mt-0.5 truncate w-full text-center">
              {label}
            </span>
            {/* Active dot indicator */}
            {isActive && (
              <span className="absolute top-1 w-1 h-1 rounded-full bg-orange-500" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
