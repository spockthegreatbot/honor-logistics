'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  status: string | null
  notes: string | null
  end_customers?: { name: string } | null
  staff?: { name: string } | null
}

interface Props {
  initialJobs: Job[]
  today: string
}

const typeColors: Record<string, string> = {
  runup: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  install: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  delivery: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  collection: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  warehouse: 'bg-green-500/15 text-green-400 border-green-500/30',
  inwards: 'bg-green-500/15 text-green-400 border-green-500/30',
  outwards: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  toner_ship: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  storage: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
}

const typeLabels: Record<string, string> = {
  runup: 'Run Up', install: 'Install', delivery: 'Delivery', collection: 'Collection',
  warehouse: 'Warehouse', inwards: 'Inwards', outwards: 'Outwards',
  toner_ship: 'Toner Ship', storage: 'Storage',
}

export default function DriverClient({ initialJobs, today }: Props) {
  const router = useRouter()
  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [updating, setUpdating] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)

  const dateStr = new Date(today + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  async function updateStatus(id: string, status: string) {
    setUpdating(id)
    setUpdateError(null)
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        const { job } = await res.json()
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: job.status } : j)))
      } else {
        const data = await res.json().catch(() => ({}))
        setUpdateError(data.error ?? 'Failed to update status. Try again.')
      }
    } catch {
      setUpdateError('Network error. Check your connection and try again.')
    } finally {
      setUpdating(null)
    }
  }

  function refresh() {
    router.refresh()
    window.location.reload()
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#f1f5f9]">📦 Today&apos;s Jobs</h1>
          <p className="text-sm text-[#94a3b8] mt-0.5">{dateStr}</p>
        </div>
        <button
          onClick={refresh}
          className="px-3 py-1.5 rounded-lg border border-[#2a2d3e] text-xs font-medium text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {updateError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
          {updateError}
        </div>
      )}

      {/* Job cards */}
      {jobs.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-lg text-[#94a3b8]">No jobs scheduled for today</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isDispatched = job.status === 'dispatched' || job.status === 'in_transit'
            const isComplete = job.status === 'complete' || job.status === 'completed'
            const typeCls = typeColors[job.job_type] ?? 'bg-[#2a2d3e] text-[#94a3b8]'

            return (
              <div
                key={job.id}
                className={cn(
                  'rounded-xl border p-4 min-h-[100px] transition-colors',
                  isComplete
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-[#1e2130] border-[#2a2d3e]'
                )}
              >
                {/* Top: badges */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-mono font-semibold text-orange-400 text-sm">
                    #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
                  </span>
                  <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', typeCls)}>
                    {typeLabels[job.job_type] ?? job.job_type}
                  </span>
                  {isComplete && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/30">
                      ✅ Complete
                    </span>
                  )}
                  {isDispatched && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30">
                      🚚 Dispatched
                    </span>
                  )}
                </div>

                {/* Middle: customer + notes */}
                <p className="text-lg font-bold text-[#f1f5f9]">
                  {job.end_customers?.name ?? 'No customer'}
                </p>
                {job.notes && (
                  <p className="text-sm text-[#94a3b8] mt-1 line-clamp-2">{job.notes}</p>
                )}

                {/* Bottom: action buttons */}
                {!isComplete && (
                  <div className="flex gap-2 mt-3">
                    {!isDispatched && (
                      <button
                        onClick={() => updateStatus(job.id, 'dispatched')}
                        disabled={updating === job.id}
                        className="flex-1 py-3 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30 font-semibold text-sm hover:bg-orange-500/25 transition-colors disabled:opacity-50"
                      >
                        {updating === job.id ? 'Updating...' : '🚚 Dispatch'}
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(job.id, 'complete')}
                      disabled={updating === job.id}
                      className="flex-1 py-3 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 font-semibold text-sm hover:bg-green-500/25 transition-colors disabled:opacity-50"
                    >
                      {updating === job.id ? 'Updating...' : '✅ Complete'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
