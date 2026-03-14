'use client'

import { Calendar, Clock, CalendarDays, CalendarRange, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DateScope = 'today' | 'tomorrow' | 'week' | 'next_week' | 'unscheduled'

interface ScopeCounts {
  today: number
  tomorrow: number
  week: number
  next_week: number
  unscheduled: number
}

interface DateNavProps {
  activeScope: DateScope
  onScopeChange: (scope: DateScope) => void
  counts: ScopeCounts
}

const SCOPES: { key: DateScope; label: string; icon: React.ElementType }[] = [
  { key: 'today', label: 'Today', icon: Clock },
  { key: 'tomorrow', label: 'Tomorrow', icon: Calendar },
  { key: 'week', label: 'This Week', icon: CalendarDays },
  { key: 'next_week', label: 'Next Week', icon: CalendarRange },
  { key: 'unscheduled', label: 'Unscheduled', icon: HelpCircle },
]

function getScopeSubtitle(scope: DateScope): string {
  const now = new Date()
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' })
  switch (scope) {
    case 'today':
      return fmt(now)
    case 'tomorrow': {
      const t = new Date(now)
      t.setDate(t.getDate() + 1)
      return fmt(t)
    }
    default:
      return ''
  }
}

export function DateNav({ activeScope, onScopeChange, counts }: DateNavProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-[240px] shrink-0 border-r border-[#2a2d3e] bg-[#0f1117] sticky top-0 h-[calc(100vh-56px)] pt-4 px-2 gap-1">
        {SCOPES.map(({ key, label, icon: Icon }) => {
          const active = activeScope === key
          const count = counts[key]
          const subtitle = active ? getScopeSubtitle(key) : ''
          return (
            <button
              key={key}
              onClick={() => onScopeChange(key)}
              className={cn(
                'relative flex items-center gap-3 w-full px-3 py-3 rounded-lg text-left transition-colors min-h-[48px]',
                active
                  ? 'bg-[#1e2130] text-[#f1f5f9]'
                  : 'text-[#94a3b8] hover:bg-[#151826] hover:text-[#f1f5f9]'
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-[#f97316] rounded-r" />
              )}
              <Icon className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold block">{label}</span>
                {subtitle && (
                  <span className="text-xs text-[#94a3b8] block">{subtitle}</span>
                )}
              </div>
              {count > 0 && (
                <span className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-full',
                  active
                    ? 'bg-[#f97316]/20 text-[#f97316]'
                    : 'bg-[#2a2d3e] text-[#94a3b8]'
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Mobile top tabs */}
      <div className="md:hidden flex items-center gap-1 overflow-x-auto px-4 py-2 border-b border-[#2a2d3e] bg-[#0f1117] sticky top-0 z-20 no-scrollbar">
        {SCOPES.map(({ key, label }) => {
          const active = activeScope === key
          const count = counts[key]
          return (
            <button
              key={key}
              onClick={() => onScopeChange(key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors shrink-0',
                active
                  ? 'bg-[#f97316] text-[#0f1117]'
                  : 'bg-[#1e2130] text-[#94a3b8]'
              )}
            >
              {label}
              {count > 0 && (
                <span className={cn(
                  'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                  active
                    ? 'bg-[#0f1117]/20 text-[#0f1117]'
                    : 'bg-[#2a2d3e] text-[#94a3b8]'
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}
