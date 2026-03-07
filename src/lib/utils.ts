import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount)
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—'
  try {
    const d = new Date(date)
    return d.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function jobStatusColor(status: string): string {
  const map: Record<string, string> = {
    new:           'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    runup_pending: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    runup_complete:'bg-sky-500/15 text-sky-400 border border-sky-500/30',
    ready:         'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
    dispatched:    'bg-orange-500/15 text-orange-400 border border-orange-500/30',
    in_transit:    'bg-violet-500/15 text-violet-400 border border-violet-500/30',
    complete:      'bg-green-500/15 text-green-400 border border-green-500/30',
    invoiced:      'bg-purple-500/15 text-purple-400 border border-purple-500/30',
    cancelled:     'bg-red-500/15 text-red-400 border border-red-500/30',
  }
  return map[status] ?? 'bg-[#2a2d3e] text-[#94a3b8] border border-[#363a52]'
}

export function jobStatusLabel(status: string): string {
  const map: Record<string, string> = {
    new: 'New',
    runup_pending: 'Run-Up Pending',
    runup_complete: 'Run-Up Complete',
    ready: 'Ready',
    dispatched: 'Dispatched',
    in_transit: 'In Transit',
    complete: 'Complete',
    invoiced: 'Invoiced',
    cancelled: 'Cancelled',
  }
  return map[status] ?? status.replace(/_/g, ' ')
}

export function jobTypeLabel(type: string): string {
  const map: Record<string, string> = {
    runup: 'Run-Up',
    delivery: 'Delivery',
    collection: 'Collection',
    install: 'Install',
    inwards: 'Inwards',
    outwards: 'Outwards',
    toner_ship: 'Toner Ship',
    storage: 'Storage',
  }
  return map[type] ?? type.replace(/_/g, ' ')
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/)
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    complete:      'bg-green-500/20 text-green-300',
    invoiced:      'bg-blue-500/20 text-blue-300',
    cancelled:     'bg-red-500/20 text-red-300',
    new:           'bg-slate-500/20 text-slate-300',
    runup_pending: 'bg-amber-500/20 text-amber-300',
    ready:         'bg-purple-500/20 text-purple-300',
    dispatched:    'bg-orange-500/20 text-orange-300',
    in_transit:    'bg-cyan-500/20 text-cyan-300',
  }
  return map[status] ?? 'bg-slate-500/20 text-slate-300'
}
