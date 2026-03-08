'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, LayoutGrid, List, Filter } from 'lucide-react'
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
  po_number: string | null
  notes: string | null
  client_reference: string | null
  parent_job_id: string | null
  machine_model?: string | null
  created_at: string | null
  clients?: { name: string; color_code?: string | null } | null
  end_customers?: { name: string } | null
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

interface Props {
  initialJobs: Job[]
  count: number
}

export function JobsClient({ initialJobs, count }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    searchParams.get('job')
  )
  const [showNewJob, setShowNewJob] = useState(searchParams.get('new') === '1')

  // Filter state
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterClientRef, setFilterClientRef] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [loadingAll, setLoadingAll] = useState(false)

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

  const filtered = jobs.filter((j) => {
    if (filterType && j.job_type !== filterType) return false
    if (filterStatus && j.status !== filterStatus) return false
    if (filterClientRef && !(j.client_reference ?? '').toLowerCase().includes(filterClientRef.toLowerCase())) return false
    return true
  })

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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={toggleShowAll}
          disabled={loadingAll}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            showAll
              ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
              : 'border-[#2a2d3e] text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e]'
          }`}
        >
          {loadingAll ? 'Loading...' : showAll ? 'Showing all jobs' : 'Show all jobs'}
        </button>
        <div className="flex items-center gap-1.5 text-xs text-[#94a3b8]">
          <Filter className="w-3.5 h-3.5" />
          Filter:
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="h-8 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] text-xs text-[#f1f5f9] px-2.5 focus:outline-none focus:ring-1 focus:ring-orange-500"
        >
          <option value="">All types</option>
          {['runup','delivery','collection','install','inwards','outwards','toner_ship','storage'].map((t) => (
            <option key={t} value={t}>{jobTypeLabel(t)}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
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
          onChange={(e) => setFilterClientRef(e.target.value)}
          placeholder="Client ref..."
          className="h-8 w-32 rounded-lg border border-[#2a2d3e] bg-[#1a1d27] text-xs text-[#f1f5f9] px-2.5 focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder:text-[#94a3b8]/60"
        />
        {(filterType || filterStatus || filterClientRef) && (
          <button
            onClick={() => { setFilterType(''); setFilterStatus(''); setFilterClientRef('') }}
            className="text-xs text-orange-400 hover:text-orange-300 transition"
          >
            Clear filters
          </button>
        )}
        {(filterType || filterStatus || filterClientRef) && (
          <span className="text-xs text-[#94a3b8]">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Views */}
      {view === 'kanban' ? (
        <KanbanBoard
          initialJobs={filtered}
          onJobClick={(id) => setSelectedJobId(id)}
        />
      ) : (
        <Card>
          {filtered.length > 0 ? (
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
                {filtered.map((job) => (
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
                  {filterType || filterStatus ? 'Try adjusting your filters' : 'Get started by creating your first job'}
                </p>
              </div>
              {!filterType && !filterStatus && (
                <Button size="sm" onClick={() => setShowNewJob(true)} className="mt-1">
                  <Plus className="w-4 h-4" />
                  New Job
                </Button>
              )}
            </div>
          )}
        </Card>
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
