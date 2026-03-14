'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, CalendarPlus, FileCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { DateNav, type DateScope } from './DateNav'
import { EFEXJobCard } from './cards/EFEXJobCard'
import { RunUpCard } from './cards/RunUpCard'
import { JobCard } from './cards/JobCard'
import { JobSlideOver } from './JobSlideOver'
import { NewJobSlideOver } from './NewJobSlideOver'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  order_types?: string[] | null
  status: string | null
  serial_number: string | null
  scheduled_date: string | null
  address_to?: string | null
  address_from?: string | null
  machine_model?: string | null
  machine_accessories?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  stair_walker?: boolean | null
  parking?: boolean | null
  special_instructions?: string | null
  has_aod?: boolean | null
  aod_pdf_url?: string | null
  aod_signed_at?: string | null
  signed_aod_url?: string | null
  signed_aod_at?: string | null
  pickup_model?: string | null
  pickup_serial?: string | null
  pickup_disposition?: string | null
  archived?: boolean | null
  po_number?: string | null
  notes?: string | null
  tracking_number?: string | null
  install_pdf_url?: string | null
  runup_completed?: boolean | null
  booking_form_url?: string | null
  machine_details?: string | null
  clients?: { name: string; color_code?: string | null } | null
  end_customers?: { name: string } | null
  staff?: { name: string } | null
}

interface ScopeCounts {
  today: number
  tomorrow: number
  week: number
  next_week: number
  unscheduled: number
  ready_to_bill: number
  archived: number
}

function getScopeLabel(scope: DateScope): string {
  const now = new Date()
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' })
  switch (scope) {
    case 'today': return `Today — ${fmt(now)}`
    case 'tomorrow': {
      const t = new Date(now); t.setDate(t.getDate() + 1)
      return `Tomorrow — ${fmt(t)}`
    }
    case 'week': return 'This Week'
    case 'next_week': return 'Next Week'
    case 'unscheduled': return 'Unscheduled'
    case 'ready_to_bill': return 'Ready to Bill'
    case 'archived': return 'Archived'
  }
}

export function ScheduleBoard() {
  const [scope, setScope] = useState<DateScope>('today')
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<ScopeCounts>({ today: 0, tomorrow: 0, week: 0, next_week: 0, unscheduled: 0, ready_to_bill: 0, archived: 0 })
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [showNewJob, setShowNewJob] = useState(false)
  const [selectedBillJobs, setSelectedBillJobs] = useState<Set<string>>(new Set())
  const [invoicing, setInvoicing] = useState(false)
  const router = useRouter()

  const fetchJobs = useCallback(async (s: DateScope) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/jobs?scope=${s}`)
      if (res.ok) {
        const json = await res.json()
        setJobs(json.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCounts = useCallback(async () => {
    const scopes: DateScope[] = ['today', 'tomorrow', 'week', 'next_week', 'unscheduled', 'ready_to_bill', 'archived']
    const results = await Promise.all(
      scopes.map(async (s) => {
        try {
          const res = await fetch(`/api/jobs?scope=${s}`)
          if (res.ok) {
            const json = await res.json()
            return { scope: s, count: json.count ?? (json.data?.length ?? 0) }
          }
        } catch {}
        return { scope: s, count: 0 }
      })
    )
    const c: ScopeCounts = { today: 0, tomorrow: 0, week: 0, next_week: 0, unscheduled: 0, ready_to_bill: 0, archived: 0 }
    for (const r of results) {
      c[r.scope] = r.count
    }
    setCounts(c)
  }, [])

  useEffect(() => {
    fetchJobs(scope)
    fetchCounts()
  }, [scope, fetchJobs, fetchCounts])

  function handleDeleteJob(jobId: string) {
    setJobs(prev => prev.filter(j => j.id !== jobId))
    setTimeout(fetchCounts, 500)
  }

  function handleStatusChange(jobId: string, newStatus: string) {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
    // Refresh counts after a brief delay
    setTimeout(fetchCounts, 1000)
  }

  function handleJobUpdated(updated: Job) {
    setJobs(prev => prev.map(j => j.id === updated.id ? { ...j, ...updated } : j))
    setTimeout(() => { fetchJobs(scope); fetchCounts() }, 500)
  }

  function handleJobCreated() {
    fetchJobs(scope)
    fetchCounts()
  }

  function handleAodClick(jobId: string) {
    setSelectedJobId(jobId)
  }

  // Sort all jobs: by status progression then name/date
  const sortedJobs = [...jobs].sort((a, b) => {
    const STATUS_ORDER: Record<string, number> = {
      new: 0, scheduled: 0, ready: 1, received: 1, runup_pending: 1,
      dispatched: 2, in_transit: 2, stored: 2, runup_complete: 2,
      complete: 3, done: 3, delivered: 3, invoiced: 4,
    }
    const sa = STATUS_ORDER[a.status ?? 'new'] ?? 0
    const sb = STATUS_ORDER[b.status ?? 'new'] ?? 0
    if (sa !== sb) return sa - sb
    const na = (a.end_customers?.name || a.contact_name || '').toLowerCase()
    const nb = (b.end_customers?.name || b.contact_name || '').toLowerCase()
    return na.localeCompare(nb)
  })

  // Clear selection when leaving ready_to_bill scope
  useEffect(() => {
    if (scope !== 'ready_to_bill') {
      setSelectedBillJobs(new Set())
    }
  }, [scope])

  // Group jobs by client for ready_to_bill view
  const clientGroups = useMemo(() => {
    if (scope !== 'ready_to_bill') return []
    const groups = new Map<string, { clientName: string; clientColor: string; clientId: string; jobs: Job[] }>()
    for (const job of sortedJobs) {
      const clientName = job.clients?.name ?? 'Unknown Client'
      const clientColor = job.clients?.color_code ?? '#6b7280'
      const clientId = clientName // Group by name since we don't have client_id on the frontend job
      if (!groups.has(clientId)) {
        groups.set(clientId, { clientName, clientColor, clientId, jobs: [] })
      }
      groups.get(clientId)!.jobs.push(job)
    }
    return Array.from(groups.values()).sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [scope, sortedJobs])

  function toggleBillJob(jobId: string) {
    setSelectedBillJobs(prev => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  function toggleClientAll(clientJobs: Job[]) {
    setSelectedBillJobs(prev => {
      const next = new Set(prev)
      const allSelected = clientJobs.every(j => next.has(j.id))
      if (allSelected) {
        clientJobs.forEach(j => next.delete(j.id))
      } else {
        clientJobs.forEach(j => next.add(j.id))
      }
      return next
    })
  }

  async function handleBulkInvoice() {
    if (selectedBillJobs.size === 0) return
    // Navigate to the invoice builder page
    router.push('/billing/generate')
  }

  const isEmpty = sortedJobs.length === 0

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-56px)]">
      {/* Date Navigation */}
      <DateNav activeScope={scope} onScopeChange={setScope} counts={counts} />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Scope header */}
        <div className="sticky top-0 z-10 bg-[#0f1117]/95 backdrop-blur-sm border-b border-[#2a2d3e] px-4 md:px-6 py-3">
          <h2 className="text-lg font-bold text-[#f1f5f9]">{getScopeLabel(scope)}</h2>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-48 bg-[#1e2130] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : isEmpty ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#1e2130] flex items-center justify-center">
                <CalendarPlus className="w-8 h-8 text-[#6b7280]" />
              </div>
              <div>
                <p className="text-lg font-semibold text-[#f1f5f9]">No jobs for this scope</p>
                <p className="text-sm text-[#94a3b8] mt-1">
                  {scope === 'unscheduled'
                    ? 'All jobs have been scheduled'
                    : 'No jobs scheduled for this period'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowNewJob(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#f97316] text-[#0f1117] font-semibold text-sm hover:bg-[#ea580c] transition"
                >
                  <Plus className="w-4 h-4" />
                  Add EFEX Job
                </button>
                <button
                  onClick={() => setShowNewJob(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#f59e0b] text-[#0f1117] font-semibold text-sm hover:bg-[#d97706] transition"
                >
                  <Plus className="w-4 h-4" />
                  Add Run-Up
                </button>
              </div>
              {scope !== 'unscheduled' && (
                <button
                  onClick={() => setScope('unscheduled')}
                  className="text-sm text-[#f97316] hover:text-[#fb923c] transition"
                >
                  View Unscheduled →
                </button>
              )}
            </div>
          ) : scope === 'ready_to_bill' ? (
            /* Ready to Bill — grouped by client */
            <div className="space-y-8">
              {clientGroups.map(group => {
                const allSelected = group.jobs.every(j => selectedBillJobs.has(j.id))
                const someSelected = group.jobs.some(j => selectedBillJobs.has(j.id))
                return (
                  <section key={group.clientName}>
                    {/* Client header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                            onChange={() => toggleClientAll(group.jobs)}
                            className="w-4 h-4 rounded border-[#2a2d3e] bg-[#1e2130] text-[#f97316] focus:ring-[#f97316] focus:ring-offset-0 cursor-pointer accent-[#f97316]"
                          />
                        </label>
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
                          style={{ backgroundColor: group.clientColor, color: '#0f1117' }}
                        >
                          {group.clientName}
                        </span>
                        <span className="text-sm text-[#94a3b8]">
                          {group.jobs.length} job{group.jobs.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                      {group.jobs.map(job => {
                        const isSelected = selectedBillJobs.has(job.id)
                        if (job.job_type === 'efex' || (job.clients?.name?.toLowerCase() === 'efex')) {
                          return (
                            <EFEXJobCard
                              key={job.id}
                              job={job}
                              onClick={setSelectedJobId}
                              onStatusChange={handleStatusChange}
                              onAodClick={handleAodClick}
                              onDelete={handleDeleteJob}
                              selectable
                              selected={isSelected}
                              onSelect={toggleBillJob}
                            />
                          )
                        }
                        if (job.job_type === 'runup') {
                          return (
                            <RunUpCard
                              key={job.id}
                              job={job}
                              onClick={setSelectedJobId}
                              onStatusChange={handleStatusChange}
                              onDelete={handleDeleteJob}
                              selectable
                              selected={isSelected}
                              onSelect={toggleBillJob}
                            />
                          )
                        }
                        return (
                          <JobCard
                            key={job.id}
                            job={job}
                            onClick={setSelectedJobId}
                            onStatusChange={handleStatusChange}
                            onDelete={handleDeleteJob}
                            selectable
                            selected={isSelected}
                            onSelect={toggleBillJob}
                          />
                        )
                      })}
                    </div>
                  </section>
                )
              })}

              {/* Sticky invoice footer */}
              {sortedJobs.length > 0 && (
                <div className="sticky bottom-0 z-20 bg-[#0f1117]/95 backdrop-blur-sm border-t border-[#2a2d3e] px-4 md:px-6 py-4 -mx-4 md:-mx-6 -mb-6">
                  <button
                    onClick={handleBulkInvoice}
                    disabled={selectedBillJobs.size === 0 || invoicing}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#f97316] text-[#0f1117] hover:bg-[#ea580c]"
                  >
                    <FileCheck className="w-4 h-4" />
                    {invoicing
                      ? 'Invoicing…'
                      : `Invoice Selected (${selectedBillJobs.size} job${selectedBillJobs.size !== 1 ? 's' : ''})`}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <section>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-[#f1f5f9]">Jobs</h3>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f97316]/20 text-[#f97316]">
                    {sortedJobs.length}
                  </span>
                </div>
              </div>
              <div className={`grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 ${scope === 'archived' ? 'opacity-70' : ''}`}>
                {sortedJobs.map(job => {
                  if (job.job_type === 'efex' || (job.clients?.name?.toLowerCase() === 'efex')) {
                    return (
                      <EFEXJobCard
                        key={job.id}
                        job={job}
                        onClick={setSelectedJobId}
                        onStatusChange={handleStatusChange}
                        onAodClick={handleAodClick}
                        onDelete={handleDeleteJob}
                      />
                    )
                  }
                  if (job.job_type === 'runup') {
                    return (
                      <RunUpCard
                        key={job.id}
                        job={job}
                        onClick={setSelectedJobId}
                        onStatusChange={handleStatusChange}
                        onDelete={handleDeleteJob}
                      />
                    )
                  }
                  // Fallback: generic card for any other job type
                  return (
                    <JobCard
                      key={job.id}
                      job={job}
                      onClick={setSelectedJobId}
                      onStatusChange={handleStatusChange}
                      onDelete={handleDeleteJob}
                    />
                  )
                })}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* FAB */}
      <button
        onClick={() => setShowNewJob(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-[#f97316] text-white shadow-lg hover:bg-[#ea580c] transition-colors flex items-center justify-center"
        aria-label="Add new job"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Job Detail Slide-Over */}
      {selectedJobId && (
        <JobSlideOver
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onJobUpdated={handleJobUpdated}
          onDelete={handleDeleteJob}
        />
      )}

      {/* New Job Slide-Over */}
      {showNewJob && (
        <NewJobSlideOver
          onClose={() => setShowNewJob(false)}
          onCreated={handleJobCreated}
        />
      )}
    </div>
  )
}
