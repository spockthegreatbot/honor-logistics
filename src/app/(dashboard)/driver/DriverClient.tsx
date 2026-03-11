'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  status: string | null
  serial_number: string | null
  machine_model: string | null
  address_to: string | null
  contact_name: string | null
  contact_phone: string | null
  order_types: string[] | null
  scheduled_date: string | null
  notes: string | null
  aod_pdf_url: string | null
  end_customers?: { name: string } | null
}

interface Props {
  initialJobs: Job[]
  today: string
}

type Filter = 'today' | 'all_active'

const ACTIVE_STATUSES = new Set(['new', 'ready', 'dispatched', 'in_transit', 'runup_pending', 'runup_complete'])

const statusDisplay: Record<string, { label: string; cls: string }> = {
  new:            { label: 'NEW',         cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ready:          { label: 'READY',       cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  runup_pending:  { label: 'RUN-UP',      cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  runup_complete: { label: 'RUN-UP DONE', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  dispatched:     { label: 'IN PROGRESS', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  in_transit:     { label: 'IN PROGRESS', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  complete:       { label: 'COMPLETED',   cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
}

function isInProgress(status: string | null) {
  return status === 'dispatched' || status === 'in_transit'
}

function isComplete(status: string | null) {
  return status === 'complete'
}

function isNew(status: string | null) {
  return status === 'new' || status === 'ready'
}

function orderLabel(job: Job): string {
  if (job.order_types && job.order_types.length > 0) {
    return job.order_types
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' '))
      .join(' + ')
  }
  return job.job_type.charAt(0).toUpperCase() + job.job_type.slice(1).replace(/_/g, ' ')
}

export default function DriverClient({ initialJobs, today }: Props) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [filter, setFilter] = useState<Filter>('today')
  const [updating, setUpdating] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [viewDate, setViewDate] = useState<string>(today) // date being browsed

  // Photo modal
  const [photoJobId, setPhotoJobId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Date navigation helpers
  function shiftDate(days: number) {
    const d = new Date(viewDate + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setViewDate(d.toLocaleDateString('en-CA'))
    setFilter('today') // switch to day view when navigating
  }

  const dateLabel = new Date(viewDate + 'T12:00:00').toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const isToday = viewDate === today

  const displayed =
    filter === 'today'
      ? jobs.filter((j) => j.scheduled_date === viewDate)
      : jobs.filter((j) => ACTIVE_STATUSES.has(j.status ?? ''))

  const todayCount = jobs.filter((j) => j.scheduled_date === viewDate).length

  async function patchJob(id: string, body: Record<string, unknown>) {
    setUpdating(id)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const { job } = await res.json()
        setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...job } : j)))
      } else {
        const data = await res.json().catch(() => ({}))
        setErrorMsg(data.error ?? 'Failed to update. Try again.')
      }
    } catch {
      setErrorMsg('Network error. Check your connection.')
    } finally {
      setUpdating(null)
    }
  }

  async function completeWithPhoto(file: File | null) {
    if (!photoJobId) return
    setUploading(true)
    setErrorMsg(null)
    try {
      let aodUrl: string | undefined
      if (file) {
        const supabase = createClient()
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `aod-photos/${photoJobId}-${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('job-documents')
          .upload(path, file, { contentType: file.type })
        if (uploadErr) {
          setErrorMsg('Photo upload failed: ' + uploadErr.message)
          setUploading(false)
          return
        }
        const { data: urlData } = supabase.storage.from('job-documents').getPublicUrl(path)
        aodUrl = urlData.publicUrl
      }
      const jobId = photoJobId
      setPhotoJobId(null)
      await patchJob(jobId, {
        status: 'complete',
        ...(aodUrl ? { aod_pdf_url: aodUrl } : {}),
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-[#0f1117]/95 backdrop-blur border-b border-[#2a2d3e] px-4 pt-4 pb-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <h1 className="text-lg font-bold text-[#f1f5f9]">♜ Honor Jobs</h1>
            {/* Date navigator */}
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => shiftDate(-1)} className="text-[#94a3b8] hover:text-[#f1f5f9] px-1 text-base">‹</button>
              <span className="text-sm text-[#f1f5f9] font-medium min-w-[110px] text-center">{dateLabel}{isToday ? ' · Today' : ''}</span>
              <button onClick={() => shiftDate(1)} className="text-[#94a3b8] hover:text-[#f1f5f9] px-1 text-base">›</button>
              {!isToday && (
                <button onClick={() => { setViewDate(today); setFilter('today') }} className="text-xs text-orange-400 hover:text-orange-300 ml-1">↩ Today</button>
              )}
            </div>
            <p className="text-xs text-[#64748b] mt-0.5">
              {filter === 'today'
                ? `${displayed.length} job${displayed.length !== 1 ? 's' : ''}`
                : `${displayed.length} active`}
            </p>
          </div>

          {/* Today / All Active toggle */}
          <div className="flex rounded-xl border border-[#2a2d3e] overflow-hidden text-sm font-medium">
            <button
              onClick={() => setFilter('today')}
              className={cn(
                'px-3 min-h-[40px] transition-colors',
                filter === 'today'
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              )}
            >
              Today
            </button>
            <button
              onClick={() => setFilter('all_active')}
              className={cn(
                'px-3 min-h-[40px] border-l border-[#2a2d3e] transition-colors',
                filter === 'all_active'
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              )}
            >
              All Active
            </button>
          </div>
        </div>
      </div>

      {/* Job list */}
      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto pb-28">
        {errorMsg && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {errorMsg}
          </div>
        )}

        {displayed.length === 0 ? (
          <div className="py-24 text-center space-y-3">
            <div className="text-5xl">📭</div>
            <p className="text-lg font-semibold text-[#94a3b8]">No jobs for today</p>
            {filter === 'today' && (
              <button
                onClick={() => setFilter('all_active')}
                className="text-sm text-orange-400 underline underline-offset-2 min-h-[44px] px-4"
              >
                View all active jobs
              </button>
            )}
          </div>
        ) : (
          displayed.map((job) => {
            const done = isComplete(job.status)
            const inProg = isInProgress(job.status)
            const jobIsNew = isNew(job.status)
            const sd = statusDisplay[job.status ?? ''] ?? {
              label: (job.status ?? '').replace(/_/g, ' ').toUpperCase(),
              cls: 'bg-[#2a2d3e] text-[#94a3b8] border-[#3a3d4e]',
            }

            return (
              <div
                key={job.id}
                className={cn(
                  'rounded-2xl border p-4 transition-colors',
                  done
                    ? 'bg-green-500/5 border-green-500/20'
                    : 'bg-[#1a1d27] border-[#2a2d3e]'
                )}
              >
                {/* Job number + status */}
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono font-bold text-orange-400 text-sm tracking-wide">
                    {job.job_number ?? job.id.slice(0, 12).toUpperCase()}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border',
                      sd.cls
                    )}
                  >
                    {sd.label}
                  </span>
                </div>

                {/* Customer */}
                <p className="text-xl font-bold text-[#f1f5f9] leading-snug">
                  {job.end_customers?.name ?? 'No customer'}
                </p>

                {/* Machine model */}
                {job.machine_model && (
                  <p className="text-sm text-[#94a3b8] mt-1">{job.machine_model}</p>
                )}

                {/* Serial */}
                {job.serial_number && (
                  <p className="text-xs text-[#64748b] mt-0.5 font-mono">
                    S/N: {job.serial_number}
                  </p>
                )}

                {/* Order type label */}
                <p className="text-sm text-[#64748b] mt-1">
                  🕒 {orderLabel(job)}
                </p>

                {/* Tappable address + phone */}
                <div className="mt-3 space-y-1">
                  {job.address_to && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(job.address_to)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 min-h-[48px] py-1 text-sm text-[#60a5fa] hover:text-[#93c5fd] active:opacity-70 transition-opacity"
                    >
                      <span className="flex-shrink-0 leading-6">📍</span>
                      <span className="leading-6">{job.address_to}</span>
                    </a>
                  )}

                  {job.contact_phone && (
                    <a
                      href={`tel:${job.contact_phone.replace(/\s/g, '')}`}
                      className="flex items-center gap-2 min-h-[48px] text-sm text-[#60a5fa] hover:text-[#93c5fd] active:opacity-70 transition-opacity"
                    >
                      <span>📞</span>
                      <span>{job.contact_phone}</span>
                    </a>
                  )}
                </div>

                {/* Action buttons */}
                {!done && (
                  <div className="flex gap-3 mt-4">
                    {jobIsNew && (
                      <button
                        onClick={() => patchJob(job.id, { status: 'in_transit' })}
                        disabled={updating === job.id}
                        className="flex-1 min-h-[52px] rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30 font-bold text-base hover:bg-blue-500/25 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {updating === job.id ? '…' : '▶ Start'}
                      </button>
                    )}
                    {(jobIsNew || inProg) && (
                      <button
                        onClick={() => setPhotoJobId(job.id)}
                        disabled={updating === job.id}
                        className="flex-1 min-h-[52px] rounded-xl bg-green-500/15 text-green-400 border border-green-500/30 font-bold text-base hover:bg-green-500/25 active:scale-95 transition-all disabled:opacity-50"
                      >
                        {updating === job.id ? '…' : '✓ Complete'}
                      </button>
                    )}
                  </div>
                )}

                {done && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
                    <span>✅</span>
                    <span>Completed</span>
                    {job.aod_pdf_url && (
                      <a
                        href={job.aod_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-xs text-[#60a5fa] underline"
                      >
                        View AOD
                      </a>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Hidden file input for photo capture */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) completeWithPhoto(file)
          // Reset so same file can re-trigger
          e.target.value = ''
        }}
      />

      {/* AOD photo modal */}
      {photoJobId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !uploading) setPhotoJobId(null)
          }}
        >
          <div className="w-full max-w-sm bg-[#1a1d27] rounded-t-3xl border-t border-x border-[#2a2d3e] p-6 space-y-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <div className="w-10 h-1 rounded-full bg-[#2a2d3e] mx-auto mb-4" />
            <h2 className="text-lg font-bold text-[#f1f5f9]">AOD Sign-off</h2>
            <p className="text-sm text-[#64748b]">
              Upload a photo of the sign-off sheet, or skip if not required.
            </p>

            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full min-h-[56px] rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30 font-bold text-base hover:bg-orange-500/25 active:scale-95 transition-all disabled:opacity-50 mt-2"
            >
              {uploading ? 'Uploading…' : '📷 Take / Choose Photo'}
            </button>

            <button
              onClick={() => completeWithPhoto(null)}
              disabled={uploading}
              className="w-full min-h-[56px] rounded-xl bg-[#0f1117] text-[#94a3b8] border border-[#2a2d3e] font-bold text-base hover:text-[#f1f5f9] active:scale-95 transition-all disabled:opacity-50"
            >
              Skip — Mark Complete
            </button>

            <button
              onClick={() => !uploading && setPhotoJobId(null)}
              disabled={uploading}
              className="w-full py-3 text-sm text-[#64748b] hover:text-[#94a3b8] transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
