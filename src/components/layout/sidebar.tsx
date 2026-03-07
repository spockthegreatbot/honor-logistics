'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Truck,
  LayoutDashboard,
  Package,
  Printer,
  Receipt,
  Settings2,
  LogOut,
  Menu,
  X,
  CalendarDays,
  Smartphone,
  BarChart3,
  FileText,
  Archive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/dashboard',  label: 'Dashboard',        icon: LayoutDashboard, group: 'main' },
  { href: '/jobs',       label: 'Jobs',              icon: Truck,           group: 'main' },
  { href: '/calendar',   label: 'Calendar',          icon: CalendarDays,    group: 'main' },
  { href: '/driver',     label: '📱 Driver View',    icon: Smartphone,      group: 'main' },
  { href: '/inventory',  label: 'Inventory / SOH',   icon: Package,         group: 'ops'  },
  { href: '/toner',      label: 'Toner Orders',      icon: Printer,         group: 'ops'  },
  { href: '/billing',    label: 'Billing',           icon: Receipt,         group: 'ops'  },
  { href: '/analytics',  label: '📊 Analytics',      icon: BarChart3,       group: 'ops'  },
  { href: '/archive',    label: 'Archive',           icon: Archive,         group: 'sys'  },
  { href: '/settings',   label: 'Settings',          icon: Settings2,       group: 'sys'  },
]

const groupLabels: Record<string, string> = {
  main: 'Operations',
  ops:  'Finance & Stock',
  sys:  'System',
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string
  label: string
  icon: React.ElementType
  active: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        active
          ? 'bg-orange-500 text-white'
          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      )}
    >
      <Icon className={cn('w-4 h-4 shrink-0', active ? 'text-white' : '')} strokeWidth={2} />
      {label}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const sidebarContent = (
    <div className="w-60 h-screen flex flex-col bg-slate-900">
      {/* Logo area */}
      <div className="px-4 py-5 border-b border-slate-800 flex items-center">
        <Image src="/logo.png" alt="Honor Logistics" width={160} height={48} className="object-contain" priority />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {(['main', 'ops', 'sys'] as const).map((group) => {
          const items = navItems.filter((i) => i.group === group)
          return (
            <div key={group} className="mb-4">
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                {groupLabels[group]}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))}
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Bottom sign out */}
      <div className="px-3 py-4 border-t border-slate-800">
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" strokeWidth={2} />
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:flex shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile hamburger button */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 w-9 h-9 bg-slate-900 text-white rounded-lg flex items-center justify-center shadow-lg"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="relative">
          <button
            className="absolute top-4 right-[-44px] w-9 h-9 bg-slate-900 text-white rounded-lg flex items-center justify-center"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
          {sidebarContent}
        </div>
      </div>
    </>
  )
}
