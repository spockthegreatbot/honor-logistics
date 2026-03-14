'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  status: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  contact_name: string | null
  contact_phone: string | null
  address_to: string | null
  address_from: string | null
  order_types: string[] | null
  machine_model: string | null
  serial_number: string | null
  notes: string | null
  clients: { name: string; color_code: string | null } | null
  end_customers: { name: string; address: string | null } | null
  staff: { name: string } | null
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Scheduled',
  ready: 'Scheduled',
  dispatched: 'Scheduled',
  runup_pending: 'Scheduled',
  runup_complete: 'Scheduled',
  in_transit: 'In Transit',
  complete: 'Done',
  completed: 'Done',
  done: 'Done',
}

const STATUS_COLORS: Record<string, string> = {
  Scheduled: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'In Transit': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Done: 'bg-green-500/20 text-green-400 border-green-500/30',
}

function getStatusLabel(status: string | null): string {
  return STATUS_LABELS[status ?? 'new'] ?? 'Scheduled'
}

function DriverPageInner() {
  const searchParams = useSearchParams()
  const driverName = searchParams.get('name')

  const [jobs, setJobs] = useState<Job[]>([])
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const url = driverName
        ? `/api/driver/today?name=${encodeURIComponent(driverName)}`
        : '/api/driver/today'
      const res = await fetch(url)
      const data = await res.json()
      setJobs(data.jobs ?? [])
      setDate(data.date ?? '')
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [driverName])

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 60000) // auto-refresh every 60s
    return () => clearInterval(interval)
  }, [fetchJobs])

  async function updateStatus(jobId: string, newStatus: string) {
    setUpdating(jobId)
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          ...(newStatus === 'complete' ? { completed_at: new Date().toISOString() } : {}),
        }),
      })
      if (res.ok) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
      }
    } catch {
      // silent
    } finally {
      setUpdating(null)
    }
  }

  const formatDisplayDate = (d: string) => {
    if (!d) return ''
    const date = new Date(d + 'T12:00:00')
    return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-20">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#f1f5f9]">
          Today — {formatDisplayDate(date)}
        </h1>
        {driverName && (
          <p className="text-sm text-[#94a3b8] mt-1">Driver: {driverName}</p>
        )}
        <p className="text-xs text-[#64748b] mt-1">{jobs.length} job{jobs.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Jobs */}
      {jobs.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-lg text-[#94a3b8]">No jobs today</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map(job => {
            const statusLabel = getStatusLabel(job.status)
            const statusColor = STATUS_COLORS[statusLabel] ?? STATUS_COLORS['Scheduled']
            const customerName = job.end_customers?.name ?? job.contact_name ?? 'Unknown'
            const address = job.address_to || job.end_customers?.address || ''
            const clientColor = job.clients?.color_code ?? '#f97316'

            return (
              <div
                key={job.id}
                className="bg-[#1e2130] border border-[#2a2d3e] rounded-xl overflow-hidden"
              >
                {/* Client badge bar */}
                <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: clientColor + '20' }}>
                  <span className="text-xs font-semibold" style={{ color: clientColor }}>
                    {job.clients?.name ?? 'Client'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
                    {statusLabel}
                  </span>
                </div>

                <div className="px-4 py-3 space-y-2">
                  {/* Customer name — large */}
                  <h2 className="text-lg font-bold text-[#f1f5f9]">{customerName}</h2>

                  {/* Address */}
                  {address && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-blue-400 hover:text-blue-300"
                    >
                      📍 {address}
                    </a>
                  )}

                  {/* Job type */}
                  <p className="text-xs text-[#94a3b8]">
                    {(job.order_types?.length ? job.order_types.join(' + ') : job.job_type).replace(/_/g, ' ')}
                    {job.scheduled_time ? ` · ${job.scheduled_time}` : ''}
                    {job.machine_model ? ` · ${job.machine_model}` : ''}
                  </p>

                  {/* Contact — tap to call */}
                  {job.contact_phone && (
                    <a
                      href={`tel:${job.contact_phone.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300"
                    >
                      📞 {job.contact_name ? `${job.contact_name} — ` : ''}{job.contact_phone}
                    </a>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-2">
                    {statusLabel === 'Scheduled' && (
                      <button
                        onClick={() => updateStatus(job.id, 'in_transit')}
                        disabled={updating === job.id}
                        className="flex-1 py-2.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-sm font-semibold hover:bg-amber-500/30 active:bg-amber-500/40 transition-colors disabled:opacity-50"
                      >
                        {updating === job.id ? '...' : '🚚 Mark In Transit'}
                      </button>
                    )}
                    {statusLabel === 'In Transit' && (
                      <button
                        onClick={() => updateStatus(job.id, 'complete')}
                        disabled={updating === job.id}
                        className="flex-1 py-2.5 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 text-sm font-semibold hover:bg-green-500/30 active:bg-green-500/40 transition-colors disabled:opacity-50"
                      >
                        {updating === job.id ? '...' : '✅ Mark Done'}
                      </button>
                    )}
                    <a
                      href={`/jobs?job=${job.id}`}
                      className="px-4 py-2.5 rounded-lg bg-[#2a2d3e] text-[#94a3b8] text-sm font-medium hover:bg-[#3a3d4e] transition-colors text-center"
                    >
                      AOD
                    </a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function DriverPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full" />
      </div>
    }>
      <DriverPageInner />
    </Suspense>
  )
}
