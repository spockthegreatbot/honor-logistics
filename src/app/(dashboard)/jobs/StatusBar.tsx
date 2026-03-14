'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const EFEX_STATUSES = ['scheduled', 'in_transit', 'done', 'invoiced'] as const
const RUNUP_STATUSES = ['received', 'stored', 'delivered'] as const

const EFEX_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_transit: 'In Transit',
  done: 'Done',
  invoiced: 'Invoiced',
}

const RUNUP_LABELS: Record<string, string> = {
  received: 'Received',
  stored: 'Stored',
  delivered: 'Delivered',
}

// Map DB statuses to our visual status system
function normalizeStatus(type: 'efex' | 'runup', dbStatus: string): string {
  if (type === 'efex') {
    // Map various DB statuses to the EFEX 4-step flow
    const map: Record<string, string> = {
      new: 'scheduled',
      ready: 'scheduled',
      dispatched: 'in_transit',
      in_transit: 'in_transit',
      complete: 'done',
      done: 'done',
      invoiced: 'invoiced',
      scheduled: 'scheduled',
    }
    return map[dbStatus] ?? 'scheduled'
  } else {
    // RunUp: map DB statuses
    const map: Record<string, string> = {
      new: 'received',
      runup_pending: 'received',
      runup_complete: 'received',
      received: 'received',
      stored: 'stored',
      delivered: 'delivered',
      complete: 'delivered',
      done: 'delivered',
      invoiced: 'delivered',
    }
    return map[dbStatus] ?? 'received'
  }
}

// Map visual status back to DB status for PATCH
function toDbStatus(type: 'efex' | 'runup', visualStatus: string): string {
  if (type === 'efex') {
    const map: Record<string, string> = {
      scheduled: 'new',
      in_transit: 'in_transit',
      done: 'complete',
      invoiced: 'invoiced',
    }
    return map[visualStatus] ?? visualStatus
  } else {
    const map: Record<string, string> = {
      received: 'runup_pending',
      stored: 'stored',
      delivered: 'delivered',
    }
    return map[visualStatus] ?? visualStatus
  }
}

interface StatusBarProps {
  type: 'efex' | 'runup'
  currentStatus: string
  jobId: string
  onStatusChange: (jobId: string, newStatus: string) => void
}

export function StatusBar({ type, currentStatus, jobId, onStatusChange }: StatusBarProps) {
  const statuses = type === 'efex' ? EFEX_STATUSES : RUNUP_STATUSES
  const labels = type === 'efex' ? EFEX_LABELS : RUNUP_LABELS
  const activeColor = type === 'efex' ? 'bg-[#f97316]' : 'bg-[#f59e0b]'

  const normalizedCurrent = normalizeStatus(type, currentStatus)
  const currentIdx = statuses.indexOf(normalizedCurrent as never)

  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [toastLabel, setToastLabel] = useState('')

  async function handleTap(targetStatus: string) {
    if (targetStatus === normalizedCurrent) return

    const dbStatus = toDbStatus(type, targetStatus)

    // Optimistic update
    setPendingStatus(targetStatus)
    setToastLabel(labels[targetStatus] ?? targetStatus)
    setShowToast(true)

    // Clear previous undo timer
    if (undoTimer) clearTimeout(undoTimer)

    const timer = setTimeout(() => {
      setShowToast(false)
      setPendingStatus(null)
    }, 5000)
    setUndoTimer(timer)

    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: dbStatus }),
      })
      if (res.ok) {
        onStatusChange(jobId, dbStatus)
      } else {
        // Revert
        setPendingStatus(null)
        setShowToast(false)
      }
    } catch {
      setPendingStatus(null)
      setShowToast(false)
    }
  }

  function handleUndo() {
    if (undoTimer) clearTimeout(undoTimer)
    setPendingStatus(null)
    setShowToast(false)
    // Re-patch to original status
    const dbStatus = toDbStatus(type, normalizedCurrent)
    fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: dbStatus }),
    }).then(() => {
      onStatusChange(jobId, dbStatus)
    })
  }

  const effectiveCurrent = pendingStatus ?? normalizedCurrent
  const effectiveIdx = statuses.indexOf(effectiveCurrent as never)

  return (
    <div className="relative">
      <div className="flex gap-[2px] w-full">
        {statuses.map((s, idx) => {
          const isActive = idx === effectiveIdx
          const isPast = idx < effectiveIdx
          const isFuture = idx > effectiveIdx

          return (
            <button
              key={s}
              onClick={(e) => {
                e.stopPropagation()
                handleTap(s)
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 min-h-[44px] text-xs font-semibold transition-all duration-150',
                // Rounded corners for first/last
                idx === 0 && 'rounded-l-lg',
                idx === statuses.length - 1 && 'rounded-r-lg',
                isActive && `${activeColor} text-[#0f1117]`,
                isPast && 'bg-[#111827] text-[#6b7280]',
                isFuture && 'bg-[#121521] text-[#9ca3af] border border-[#2a2d3e]',
                !isActive && 'hover:brightness-125 cursor-pointer',
                isActive && 'cursor-default'
              )}
            >
              {isPast && <Check className="w-3 h-3" />}
              <span className="truncate">{labels[s]}</span>
            </button>
          )
        })}
      </div>

      {/* Undo toast */}
      {showToast && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#1e2130] border border-[#2a2d3e] rounded-lg px-3 py-2 shadow-lg z-30 whitespace-nowrap">
          <span className="text-xs text-[#f1f5f9]">
            Marked <strong>{toastLabel}</strong> •{' '}
            {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' })}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleUndo()
            }}
            className="text-xs font-semibold text-[#f97316] hover:text-[#fb923c] transition"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  )
}
