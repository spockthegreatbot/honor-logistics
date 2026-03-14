'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, LayoutGrid, List, Filter, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KanbanBoard } from './KanbanBoard'
import { JobSlideOver } from './JobSlideOver'
import { NewJobSlideOver } from './NewJobSlideOver'
import { StatusBadge } from '@/components/ui/badge'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell
} from '@/components/ui/table'
import { Card } from '@/components/ui/card'
import { formatDate, jobTypeLabel } from '@/lib/utils'
import Link from 'next/link'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  order_types?: string[] | null
  status: string | null
  serial_number: string | null
  scheduled_date: string | null
  address_to?: string | null
  po_number: string | null
  notes: string | null
  client_reference: string | null
  parent_job_id: string | null
  machine_model?: string | null
  created_at: string | null
  archived?: boolean | null
  runup_completed?: boolean | null
  board_column?: string | null
  clients?: { name: string; color_code?: string | null } | null
  end_customers?: { name: string; address?: string | null } | null
  staff?: { name: string } | null
  runup_details?: { check_signed_off: boolean | null } | null
}

const EFEX_TYPE_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  installation: 'Installation',
  pickup: 'Pick-Up',
  relocation: 'Relocation',
}

function orderTypeLabel(job: Job): string {
  const types = job.order_types
  if (types && types.length > 0) {
    return types.map(t => EFEX_TYPE_LABELS[t] ?? jobTypeLabel(t)).join(' + ')
  }
  return jobTypeLabel(job.job_type)
}

type StatusGroup = 'all' | 'new' | 'in_progress' | 'completed'

const STATUS_GROUPS: Record<StatusGroup, string[]> = {
  all:         [],
  new:         ['new', 'runup_pending', 'runup_complete'],
  in_progress: ['ready', 'dispatched', 'in_transit'],
  completed:   ['complete', 'invoiced', 'cancelled'],
}

const PAGE_SIZE = 20

interface Props {
  initialJobs: Job[]
  count: number
}

export function JobsClient({ initialJobs, count }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [view, setView] = useState<'kanban' | 'list' | 'calendar'>('kanban')
  const [calendarWeekOffset, setCalendarWeekOffset] = useState(0)
  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    searchParams.get('job')
  )
  const [showNewJob, setShowNewJob] = useState(searchParams.get('new') === '1')

  // Filter state
  const [statusGroup, setStatusGroup] = useState<StatusGroup>('all')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterClientRef, setFilterClientRef] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)

  // Pagination
  const [page, setPage] = useState(0)

  async function toggleShowAll() {
    const next = !showAll
    setShowAll(next)
    setLoadingAll(true)
    try {
      const url = next ? '/api/jobs?show_all=1' : '/api/jobs'
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        setJobs(json.data ?? [])
      }
    } finally {
      setLoadingAll(false)
    }
  }

  // Reset page when filters change
  function handleStatusGroup(g: StatusGroup) {
    setStatusGroup(g)
    setPage(0)
  }
  function handleFilterType(v: string) { setFilterType(v); setPage(0) }
  function handleFilterStatus(v: string) { setFilterStatus(v); setPage(0) }
  function handleFilterClientRef(v: string) { setFilterClientRef(v); setPage(0) }

  const filtered = jobs.filter((j) => {
    // Status group pill filter
    const group = STATUS_GROUPS[statusGroup]
    if (group.length > 0 && !group.includes(j.status ?? '')) return false
    if (filterType && j.job_type !== filterType) return false
    if (filterStatus && j.status !== filterStatus) return false
    if (filterClientRef && !(j.client_reference ?? '').toLowerCase().includes(filterClientRef.toLowerCase())) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function handleJobUpdated(updated: Job) {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? { ...j, ...updated } : j)))
  }

  function handleJobCreated(job: never) {
    setJobs((prev) => [job as unknown as Job, ...prev])
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[#f1f5f9]">Jobs</h1>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#2a2d3e] text-[#94a3b8]">
            {count}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-[#2a2d3e] overflow-hidden">
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium transition ${
                view === 'kanban'
                  ? 'bg-[#2a2d3e] text-[#f1f5f9]'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Board
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium transition ${
                view === 'list'
                  ? 'bg-[#2a2d3e] text-[#f1f5f9]'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              onClick={() => { setView('calendar'); setCalendarWeekOffset(0) }}
              className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium transition ${
                view === 'calendar'
                  ? 'bg-[#2a2d3e] text-[#f1f5f9]'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Calendar
            </button>
          </div>
          <a
            href="/api/export/jobs"
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2d3e] text-xs font-medium text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition-colors"
          >
            ⬇ Export CSV
          </a>
          <Button size="sm" onClick={() => setShowNewJob(true)}>
            <Plus className="w-4 h-4" />
            New Job
          </Button>
        </div>
      </div>

      {/* Status Group Pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'new', 'in_progress', 'completed'] as StatusGroup[]).map((g) => {
          const labels: Record<StatusGroup, string> = { all: 'All', new: 'New', in_progress: 'In Progress', completed: 'Completed' }
          const active = statusGroup === g
          return (
            <button
              key={g}
              onClick={() => handleStatusGroup(g)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                active
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'border-[#2a2d3e] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e]'
              }`}
            >
              {labels[g]}
            </button>
          )
        })}
        <button
          onClick={toggleShowAll}
          disabled={loadingAll}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
            showAll
              ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
              : 'border-[#2a2d3e] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e]'
          }`}
        >
          {loadingAll ? 'Loading...' : showAll ? '✓ Show All' : 'Show All'}
        </button>
      </div>

      {/* Sub-filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-[#94a3b8]">
          <Filter className="w-3.5 h-3.5" />
          Filter:
        </div>
        <select
          value={filterType}
          onChange={(e) => handleFilterType(e.target.value)}
          className="h-8 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] text-xs text-[#f1f5f9] px-2.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">All types</option>
          {['runup','delivery','collection','install','inwards','outwards','toner_ship','storage'].map((t) => (
            <option key={t} value={t}>{jobTypeLabel(t)}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => handleFilterStatus(e.target.value)}
          className="h-8 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] text-xs text-[#f1f5f9] px-2.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">All statuses</option>
          {['new','runup_pending','runup_complete','ready','dispatched','in_transit','complete','invoiced','cancelled'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <input
          type="text"
          value={filterClientRef}
          onChange={(e) => handleFilterClientRef(e.target.value)}
          placeholder="Client ref..."
          className="h-8 w-32 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] text-xs text-[#f1f5f9] px-2.5 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-[#94a3b8]/60"
        />
        {(filterType || filterStatus || filterClientRef) && (
          <button
            onClick={() => { handleFilterType(''); handleFilterStatus(''); handleFilterClientRef('') }}
            className="text-xs text-orange-400 hover:text-orange-300 transition"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-[#94a3b8]">{filtered.length} job{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Views */}
      {view === 'calendar' ? (() => {
        // Week view calendar
        const today = new Date()
        const weekStart = new Date(today)
        weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7) + calendarWeekOffset * 7) // Monday
        const weekDays = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(weekStart)
          d.setDate(weekStart.getDate() + i)
          return d
        })

        const todayStr = today.toISOString().slice(0, 10)

        const fmt = (d: Date) => d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
        const weekLabel = `${fmt(weekDays[0])} – ${fmt(weekDays[6])}`

        function jobsForDay(day: Date) {
          const dayStr = day.toISOString().slice(0, 10)
          return filtered.filter(j => j.scheduled_date === dayStr)
        }

        const STATUS_COLORS: Record<string, string> = {
          new: 'bg-blue-400', scheduled: 'bg-blue-400', ready: 'bg-blue-400',
          in_transit: 'bg-amber-400', dispatched: 'bg-amber-400',
          complete: 'bg-emerald-400', done: 'bg-emerald-400', delivered: 'bg-emerald-400',
          invoiced: 'bg-purple-400', cancelled: 'bg-red-400',
          runup_pending: 'bg-amber-400', runup_complete: 'bg-cyan-400', stored: 'bg-cyan-400',
        }

        return (
          <div className="space-y-4">
            {/* Week navigation */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCalendarWeekOffset(o => o - 1)}
                className="p-2 rounded-lg border border-[#2a2d3e] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold text-[#f1f5f9] min-w-[200px] text-center">{weekLabel}</span>
              <button
                onClick={() => setCalendarWeekOffset(o => o + 1)}
                className="p-2 rounded-lg border border-[#2a2d3e] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {calendarWeekOffset !== 0 && (
                <button
                  onClick={() => setCalendarWeekOffset(0)}
                  className="px-3 py-1.5 rounded-lg border border-[#2a2d3e] text-xs font-medium text-[#94a3b8] hover:text-[#f1f5f9] transition"
                >
                  Today
                </button>
              )}
            </div>

            {/* Desktop grid */}
            <div className="hidden md:block rounded-xl border border-[#2a2d3e] overflow-hidden">
              <div className="grid grid-cols-7 border-b border-[#2a2d3e] bg-[#1a1d27]">
                {weekDays.map(d => (
                  <div key={d.toISOString()} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#94a3b8] text-center">
                    {d.toLocaleDateString('en-AU', { weekday: 'short' })}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 min-h-[400px]">
                {weekDays.map((day, idx) => {
                  const dayStr = day.toISOString().slice(0, 10)
                  const dayJobs = jobsForDay(day)
                  const isToday = dayStr === todayStr
                  return (
                    <div
                      key={dayStr}
                      className={`min-h-[120px] p-2 border-r last:border-r-0 border-[#2a2d3e] ${
                        isToday ? 'bg-orange-500/5' : 'bg-[#1e2130]'
                      }`}
                    >
                      <div className={`text-sm font-semibold mb-2 w-7 h-7 flex items-center justify-center rounded-full ${
                        isToday ? 'bg-orange-500 text-white' : 'text-[#94a3b8]'
                      }`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayJobs.map(job => (
                          <button
                            key={job.id}
                            onClick={() => setSelectedJobId(job.id)}
                            className="w-full text-left text-xs rounded border border-[#2a2d3e] bg-[#151826] hover:border-[#3a3d4e] px-1.5 py-1 flex items-center gap-1.5 transition truncate"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[job.status ?? 'new'] ?? 'bg-[#94a3b8]'}`} />
                            <span className="font-bold text-[#f97316]">#{String(job.job_number ?? job.id).slice(-6)}</span>
                            <span className="text-[#94a3b8] truncate">{job.end_customers?.name ?? job.clients?.name ?? ''}</span>
                          </button>
                        ))}
                        {dayJobs.length === 0 && <span className="text-xs text-[#94a3b8]/30">—</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Mobile stacked */}
            <div className="md:hidden space-y-3">
              {weekDays.map(day => {
                const dayStr = day.toISOString().slice(0, 10)
                const dayJobs = jobsForDay(day)
                const isToday = dayStr === todayStr
                return (
                  <div key={dayStr} className={`rounded-xl border ${isToday ? 'border-orange-500/40 bg-orange-500/5' : 'border-[#2a2d3e] bg-[#1e2130]'}`}>
                    <div className="px-3 py-2 border-b border-[#2a2d3e] flex items-center gap-2">
                      <span className={`text-sm font-bold ${isToday ? 'text-orange-400' : 'text-[#f1f5f9]'}`}>
                        {day.toLocaleDateString('en-AU', { weekday: 'short' })}
                      </span>
                      <span className={`text-xs ${isToday ? 'text-orange-300' : 'text-[#94a3b8]'}`}>
                        {day.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </span>
                      {isToday && <span className="ml-auto text-xs text-orange-400 font-medium">Today</span>}
                      {dayJobs.length > 0 && <span className="ml-auto text-xs text-[#94a3b8]">{dayJobs.length}</span>}
                    </div>
                    {dayJobs.length > 0 ? (
                      <div className="p-2 space-y-1.5">
                        {dayJobs.map(job => (
                          <button
                            key={job.id}
                            onClick={() => setSelectedJobId(job.id)}
                            className="w-full text-left rounded-lg border border-[#2a2d3e] bg-[#151826] px-3 py-2 flex items-center gap-2 hover:border-[#3a3d4e] transition"
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[job.status ?? 'new'] ?? 'bg-[#94a3b8]'}`} />
                            <span className="text-xs font-bold text-[#f97316]">#{String(job.job_number ?? job.id).slice(-6)}</span>
                            <span className="text-xs text-[#94a3b8] flex-1 truncate">{job.end_customers?.name ?? job.clients?.name ?? ''}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="px-3 py-2 text-xs text-[#94a3b8]/40">No jobs</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })() : view === 'kanban' ? (
        <KanbanBoard
          initialJobs={filtered}
          onJobClick={(id) => setSelectedJobId(id)}
        />
      ) : (
        <>
          <Card>
            {paginated.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((job) => (
                    <TableRow
                      key={job.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      <TableCell>
                        <span className="font-mono font-semibold text-orange-400">
                          #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold text-orange-300 bg-orange-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {orderTypeLabel(job)}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium text-[#f1f5f9]">
                        {job.clients?.name
                          ? <span style={{ color: job.clients.color_code ?? undefined }} className="font-semibold">{job.clients.name}</span>
                          : '—'}
                      </TableCell>
                      <TableCell className="text-[#94a3b8]">
                        {job.end_customers?.name ?? '—'}
                      </TableCell>
                      <TableCell><StatusBadge status={job.status ?? ''} /></TableCell>
                      <TableCell className="text-[#94a3b8]">{formatDate(job.scheduled_date)}</TableCell>
                      <TableCell className="text-[#94a3b8]">{job.staff?.name ?? '—'}</TableCell>
                      <TableCell className="text-[#94a3b8]">{formatDate(job.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-16 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#2a2d3e] flex items-center justify-center">
                  <List className="w-6 h-6 text-[#94a3b8]" />
                </div>
                <div>
                  <p className="font-semibold text-[#f1f5f9]">No jobs found</p>
                  <p className="text-sm text-[#94a3b8] mt-0.5">
                    {filterType || filterStatus || statusGroup !== 'all' ? 'Try adjusting your filters' : 'Get started by creating your first job'}
                  </p>
                </div>
                {!filterType && !filterStatus && statusGroup === 'all' && (
                  <Button size="sm" onClick={() => setShowNewJob(true)} className="mt-1">
                    <Plus className="w-4 h-4" />
                    New Job
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-[#94a3b8]">
                Page {page + 1} of {totalPages} · {filtered.length} jobs
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg border border-[#2a2d3e] text-xs font-medium text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  // Show pages around current
                  const mid = Math.min(Math.max(page, 3), totalPages - 4)
                  const p = totalPages <= 7 ? i : i + Math.max(0, mid - 3)
                  if (p >= totalPages) return null
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                        p === page
                          ? 'bg-orange-500 text-white'
                          : 'border border-[#2a2d3e] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e]'
                      }`}
                    >
                      {p + 1}
                    </button>
                  )
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg border border-[#2a2d3e] text-xs font-medium text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Job Detail Slide-Over */}
      {selectedJobId && (
        <JobSlideOver
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onJobUpdated={handleJobUpdated}
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
