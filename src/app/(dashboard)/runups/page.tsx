'use client'

import { useState, useEffect, useCallback } from 'react'
import { Warehouse, Package, Truck, CheckCircle2, RefreshCw } from 'lucide-react'
import { RunUpCard } from '../jobs/cards/RunUpCard'
import { JobSlideOver } from '../jobs/JobSlideOver'
import { cn } from '@/lib/utils'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  status: string | null
  serial_number?: string | null
  scheduled_date?: string | null
  po_number?: string | null
  contact_name?: string | null
  notes?: string | null
  machine_model?: string | null
  machine_accessories?: string | null
  special_instructions?: string | null
  tracking_number?: string | null
  install_pdf_url?: string | null
  runup_completed?: boolean | null
  booking_form_url?: string | null
  aod_pdf_url?: string | null
  archived?: boolean | null
  clients?: { name: string; color_code?: string | null } | null
  end_customers?: { name: string } | null
  staff?: { name: string } | null
}

type TabKey = 'active' | 'ready' | 'completed'

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: 'active', label: 'Active', icon: Package },
  { key: 'ready', label: 'Ready for Delivery', icon: Truck },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
]

export default function RunUpsPage() {
  const [tab, setTab] = useState<TabKey>('active')
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<Record<TabKey, number>>({ active: 0, ready: 0, completed: 0 })
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const fetchJobs = useCallback(async (group: TabKey) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/runups?group=${group}`)
      if (res.ok) {
        const json = await res.json()
        setJobs(json.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchCounts = useCallback(async () => {
    const groups: TabKey[] = ['active', 'ready', 'completed']
    const results = await Promise.all(
      groups.map(async (g) => {
        try {
          const res = await fetch(`/api/runups?group=${g}`)
          if (res.ok) {
            const json = await res.json()
            return { group: g, count: json.count ?? (json.data?.length ?? 0) }
          }
        } catch {}
        return { group: g, count: 0 }
      })
    )
    const c: Record<TabKey, number> = { active: 0, ready: 0, completed: 0 }
    for (const r of results) c[r.group] = r.count
    setCounts(c)
  }, [])

  useEffect(() => {
    fetchJobs(tab)
    fetchCounts()
  }, [tab, fetchJobs, fetchCounts])

  function handleDeleteJob(jobId: string) {
    setJobs(prev => prev.filter(j => j.id !== jobId))
    setTimeout(fetchCounts, 500)
  }

  function handleStatusChange(jobId: string, newStatus: string) {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
    setTimeout(fetchCounts, 1000)
  }

  function handleJobUpdated(updated: Job) {
    setJobs(prev => prev.map(j => j.id === updated.id ? { ...j, ...updated } : j))
    setTimeout(() => { fetchJobs(tab); fetchCounts() }, 500)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0f1117]/95 backdrop-blur-sm border-b border-[#2a2d3e] px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Warehouse className="w-5 h-5 text-[#f59e0b]" />
            <h1 className="text-xl font-bold text-[#f1f5f9]">Run-Ups</h1>
          </div>
          <button
            onClick={() => { fetchJobs(tab); fetchCounts() }}
            className="p-2 rounded-lg text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#1e2130] transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mt-4">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                tab === key
                  ? 'bg-[#f59e0b] text-[#0f1117]'
                  : 'bg-[#1e2130] text-[#94a3b8] hover:text-[#f1f5f9]'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
              {counts[key] > 0 && (
                <span className={cn(
                  'text-xs font-bold px-1.5 py-0.5 rounded-full',
                  tab === key
                    ? 'bg-[#0f1117]/20 text-[#0f1117]'
                    : 'bg-[#2a2d3e] text-[#94a3b8]'
                )}>
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 md:p-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-[#1e2130] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#1e2130] flex items-center justify-center">
              <Package className="w-8 h-8 text-[#6b7280]" />
            </div>
            <div>
              <p className="text-lg font-semibold text-[#f1f5f9]">
                {tab === 'active' && 'No active run-ups'}
                {tab === 'ready' && 'No run-ups ready for delivery'}
                {tab === 'completed' && 'No completed run-ups'}
              </p>
              <p className="text-sm text-[#94a3b8] mt-1">
                {tab === 'active' && 'Run-up jobs will appear here once received'}
                {tab === 'ready' && 'Run-ups will move here once the run-up checklist is complete'}
                {tab === 'completed' && 'Delivered run-ups will appear here'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {jobs.map(job => (
              <RunUpCard
                key={job.id}
                job={job}
                onClick={setSelectedJobId}
                onStatusChange={handleStatusChange}
                onDelete={handleDeleteJob}
              />
            ))}
          </div>
        )}
      </div>

      {/* Job Detail Slide-Over */}
      {selectedJobId && (
        <JobSlideOver
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onJobUpdated={handleJobUpdated}
          onDelete={handleDeleteJob}
        />
      )}
    </div>
  )
}
