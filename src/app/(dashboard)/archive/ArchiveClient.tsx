'use client'

import { useState, useMemo, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { Search, Download, Archive, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { jobTypeLabel, statusColor } from '@/lib/utils'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  status: string | null
  scheduled_date: string | null
  created_at: string
  notes: string | null
  clients?: { id: string; name: string } | null
  end_customers?: { name: string } | null
}

interface Client {
  id: string
  name: string
}

interface Props {
  jobs: Job[]
  clients: Client[]
  totalCount: number
}

const JOB_TYPES = ['runup', 'install', 'delivery', 'collection', 'storage', 'toner', 'inwards', 'outwards', 'misc']
const STATUSES = ['complete', 'invoiced', 'cancelled']
const PAGE_SIZE = 50

const YEARS = (() => {
  const y = []
  for (let yr = new Date().getFullYear(); yr >= 2020; yr--) y.push(yr)
  return y
})()

export function ArchiveClient({ jobs, clients, totalCount }: Props) {
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    let rows = jobs
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(j =>
        j.job_number?.toLowerCase().includes(q) ||
        j.clients?.name?.toLowerCase().includes(q) ||
        j.end_customers?.name?.toLowerCase().includes(q) ||
        j.notes?.toLowerCase().includes(q)
      )
    }
    if (clientFilter !== 'all') rows = rows.filter(j => j.clients?.id === clientFilter)
    if (typeFilter !== 'all') rows = rows.filter(j => j.job_type === typeFilter)
    if (statusFilter !== 'all') rows = rows.filter(j => j.status === statusFilter)
    if (yearFilter !== 'all') {
      rows = rows.filter(j => {
        const date = j.scheduled_date ?? j.created_at
        return date?.startsWith(yearFilter)
      })
    }
    return rows
  }, [jobs, search, clientFilter, typeFilter, statusFilter, yearFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const resetPage = useCallback(() => setPage(1), [])

  function exportCSV() {
    const headers = ['Job Number', 'Client', 'End Customer', 'Type', 'Status', 'Scheduled Date', 'Notes']
    const rows = filtered.map(j => [
      j.job_number ?? '',
      j.clients?.name ?? '',
      j.end_customers?.name ?? '',
      jobTypeLabel(j.job_type),
      j.status ?? '',
      j.scheduled_date ?? '',
      (j.notes ?? '').replace(/,/g, ';'),
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `honor-archive-${yearFilter !== 'all' ? yearFilter : 'all'}-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    try { return format(parseISO(d), 'd MMM yyyy') } catch { return d }
  }

  const selectClass = "bg-[#1a1d27] border border-[#2a2d3e] text-[#94a3b8] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500/50 cursor-pointer"

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#2a2d3e] flex items-center justify-center">
            <Archive className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#f1f5f9]">Archive</h1>
            <p className="text-xs text-[#94a3b8] mt-0.5">{totalCount.toLocaleString()} total historical jobs</p>
          </div>
        </div>
        <Button
          onClick={exportCSV}
          variant="outline"
          size="sm"
          className="flex items-center gap-2 border-[#2a2d3e] text-[#94a3b8] hover:text-[#f1f5f9]"
        >
          <Download className="w-4 h-4" />
          Export CSV
          {filtered.length !== jobs.length && (
            <span className="ml-1 text-orange-400">({filtered.length})</span>
          )}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
          <input
            type="text"
            placeholder="Search job number, client, notes…"
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage() }}
            className="w-full bg-[#1a1d27] border border-[#2a2d3e] text-[#f1f5f9] text-sm rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-orange-500/50 placeholder:text-[#94a3b8]/40"
          />
        </div>

        <select value={yearFilter} onChange={e => { setYearFilter(e.target.value); resetPage() }} className={selectClass}>
          <option value="all">All Years</option>
          {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>

        <select value={clientFilter} onChange={e => { setClientFilter(e.target.value); resetPage() }} className={selectClass}>
          <option value="all">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); resetPage() }} className={selectClass}>
          <option value="all">All Types</option>
          {JOB_TYPES.map(t => <option key={t} value={t}>{jobTypeLabel(t)}</option>)}
        </select>

        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); resetPage() }} className={selectClass}>
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        {(search || clientFilter !== 'all' || typeFilter !== 'all' || statusFilter !== 'all' || yearFilter !== 'all') && (
          <button
            onClick={() => { setSearch(''); setClientFilter('all'); setTypeFilter('all'); setStatusFilter('all'); setYearFilter('all'); resetPage() }}
            className="text-xs text-orange-400 hover:text-orange-300 underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-xs text-[#94a3b8]">
        <span>
          Showing <span className="text-[#f1f5f9] font-medium">{filtered.length.toLocaleString()}</span> jobs
          {filtered.length !== jobs.length && <span> (filtered from {jobs.length.toLocaleString()})</span>}
        </span>
        {totalPages > 1 && (
          <span>Page {page} of {totalPages}</span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#2a2d3e] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2d3e] bg-[#1a1d27]">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">Job #</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">End Customer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">Scheduled</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2d3e]">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[#94a3b8]">
                    <Archive className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No jobs match your filters</p>
                    <p className="text-xs mt-1 opacity-60">Try adjusting the search or filters</p>
                  </td>
                </tr>
              ) : (
                paginated.map((job, idx) => (
                  <tr
                    key={job.id}
                    className={`hover:bg-[#2a2d3e]/40 transition-colors ${idx % 2 === 0 ? 'bg-[#1e2130]' : 'bg-[#1a1d27]'}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-orange-400 font-medium whitespace-nowrap">
                      {job.job_number ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[#f1f5f9] font-medium whitespace-nowrap">
                      {job.clients?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-[#94a3b8] whitespace-nowrap">
                      {job.end_customers?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#2a2d3e] text-[#94a3b8]">
                        {jobTypeLabel(job.job_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColor(job.status ?? '')}`}>
                        {job.status ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#94a3b8] whitespace-nowrap text-xs">
                      {formatDate(job.scheduled_date)}
                    </td>
                    <td className="px-4 py-3 text-[#94a3b8] text-xs max-w-[240px] truncate">
                      {job.notes ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost" size="icon"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="h-8 w-8"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 7) { pageNum = i + 1 }
              else if (page <= 4) { pageNum = i + 1 }
              else if (page >= totalPages - 3) { pageNum = totalPages - 6 + i }
              else { pageNum = page - 3 + i }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded text-xs font-medium transition ${
                    page === pageNum
                      ? 'bg-orange-500 text-white'
                      : 'text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#2a2d3e]'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
          </div>
          <Button
            variant="ghost" size="icon"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="h-8 w-8"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
