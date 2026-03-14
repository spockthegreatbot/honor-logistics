'use client'

import { useState } from 'react'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// EFEX flow: scheduled → in_transit → done → invoiced
// RunUp flow: received → stored → delivered

const EFEX_FLOW: { visual: string; db: string; label: string }[] = [
  { visual: 'scheduled', db: 'new', label: 'In Transit' },
  { visual: 'in_transit', db: 'in_transit', label: 'Done' },
  { visual: 'done', db: 'complete', label: 'Invoiced' },
]

const RUNUP_FLOW: { visual: string; db: string; label: string }[] = [
  { visual: 'received', db: 'runup_pending', label: 'Stored' },
  { visual: 'stored', db: 'stored', label: 'Delivered' },
]

// Map DB status → visual status
function normalizeEfex(dbStatus: string): string {
  const map: Record<string, string> = {
    new: 'scheduled', ready: 'scheduled', scheduled: 'scheduled',
    dispatched: 'in_transit', in_transit: 'in_transit',
    complete: 'done', done: 'done',
    invoiced: 'invoiced',
  }
  return map[dbStatus] ?? 'scheduled'
}

function normalizeRunup(dbStatus: string): string {
  const map: Record<string, string> = {
    new: 'received', runup_pending: 'received', runup_complete: 'received', received: 'received',
    stored: 'stored',
    delivered: 'delivered', complete: 'delivered', done: 'delivered', invoiced: 'delivered',
  }
  return map[dbStatus] ?? 'received'
}

// Map visual → next DB status
function getNextDbStatus(type: 'efex' | 'runup', visualStatus: string): { dbStatus: string; label: string } | null {
  const flow = type === 'efex' ? EFEX_FLOW : RUNUP_FLOW
  const step = flow.find(f => f.visual === visualStatus)
  if (!step) return null

  // Find next step
  const idx = flow.indexOf(step)
  if (idx === flow.length - 1) return null // already at end

  const next = flow[idx + 1]
  return { dbStatus: type === 'efex' 
    ? ({ in_transit: 'in_transit', done: 'complete', invoiced: 'invoiced' }[next.visual] ?? next.db)
    : ({ stored: 'stored', delivered: 'delivered' }[next.visual] ?? next.db),
    label: step.label }
}

interface QuickActionButtonProps {
  jobId: string
  currentStatus: string
  type: 'efex' | 'runup'
  onStatusChange: (jobId: string, newStatus: string) => void
}

export function QuickActionButton({ jobId, currentStatus, type, onStatusChange }: QuickActionButtonProps) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const visual = type === 'efex' ? normalizeEfex(currentStatus) : normalizeRunup(currentStatus)
  const next = getNextDbStatus(type, visual)

  if (!next) return null // Already at final status

  const accentColor = type === 'efex' ? '#f97316' : '#f59e0b'

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (loading || done) return

    setLoading(true)

    // Optimistic update
    onStatusChange(jobId, next!.dbStatus)

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next!.dbStatus }),
      })
      if (res.ok) {
        setDone(true)
        setTimeout(() => setDone(false), 2000)
      } else {
        // Revert — re-set to original status
        onStatusChange(jobId, currentStatus)
      }
    } catch {
      onStatusChange(jobId, currentStatus)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'w-full flex items-center justify-center gap-2 rounded-lg font-semibold text-sm transition-all',
        'min-h-[44px] px-4 py-3',
        'active:scale-[0.98]',
        done
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          : 'text-[#0f1117] hover:brightness-110'
      )}
      style={!done ? { backgroundColor: accentColor } : undefined}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : done ? (
        <>
          <Check className="w-4 h-4" />
          Updated
        </>
      ) : (
        <>
          <ArrowRight className="w-4 h-4" />
          {next.label}
        </>
      )}
    </button>
  )
}
