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
    new: 'bg-blue-100 text-blue-700 border border-blue-200',
    runup_pending: 'bg-amber-100 text-amber-700 border border-amber-200',
    runup_complete: 'bg-sky-100 text-sky-700 border border-sky-200',
    ready: 'bg-cyan-100 text-cyan-700 border border-cyan-200',
    dispatched: 'bg-orange-100 text-orange-700 border border-orange-200',
    in_transit: 'bg-violet-100 text-violet-700 border border-violet-200',
    complete: 'bg-green-100 text-green-700 border border-green-200',
    invoiced: 'bg-purple-100 text-purple-700 border border-purple-200',
    cancelled: 'bg-red-100 text-red-700 border border-red-200',
  }
  return map[status] ?? 'bg-slate-100 text-slate-600 border border-slate-200'
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
