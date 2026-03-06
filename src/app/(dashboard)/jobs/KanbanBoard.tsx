'use client'

import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Calendar, User } from 'lucide-react'
import { StatusBadge } from '@/components/ui/badge'
import { formatDate, jobTypeLabel, getInitials, jobStatusLabel } from '@/lib/utils'

type JobStatus = 'new' | 'runup_pending' | 'runup_complete' | 'ready' | 'dispatched' | 'complete' | 'invoiced'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  status: string | null
  serial_number: string | null
  scheduled_date: string | null
  clients?: { name: string } | null
  end_customers?: { name: string } | null
  staff?: { name: string } | null
  runup_details?: { check_signed_off: boolean | null } | null
}

const COLUMNS: { id: JobStatus; label: string; accent: string }[] = [
  { id: 'new',            label: 'New',              accent: 'border-blue-500/40' },
  { id: 'runup_pending',  label: 'Run-Up Pending',   accent: 'border-amber-500/40' },
  { id: 'runup_complete', label: 'Run-Up Complete',  accent: 'border-sky-500/40' },
  { id: 'ready',          label: 'Ready',            accent: 'border-cyan-500/40' },
  { id: 'dispatched',     label: 'Dispatched',       accent: 'border-orange-500/40' },
  { id: 'complete',       label: 'Complete',         accent: 'border-green-500/40' },
  { id: 'invoiced',       label: 'Invoiced',         accent: 'border-purple-500/40' },
]

const JOB_TYPE_COLORS: Record<string, string> = {
  runup:      'bg-amber-500/10 border-amber-500/20 text-amber-400',
  delivery:   'bg-blue-500/10 border-blue-500/20 text-blue-400',
  collection: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  install:    'bg-green-500/10 border-green-500/20 text-green-400',
  toner_ship: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
  inwards:    'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  outwards:   'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  storage:    'bg-slate-500/10 border-slate-500/20 text-slate-400',
}

function JobCard({
  job,
  index,
  onClick,
}: {
  job: Job
  index: number
  onClick: () => void
}) {
  const typeColor = JOB_TYPE_COLORS[job.job_type] ?? 'bg-[#2a2d3e] border-[#363a52] text-[#94a3b8]'
  const staffInitials = job.staff?.name ? getInitials(job.staff.name) : null

  return (
    <Draggable draggableId={job.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`
            rounded-xl border bg-[#1e2130] p-3 cursor-pointer
            transition-all duration-150 group
            ${snapshot.isDragging
              ? 'border-orange-500/50 shadow-lg shadow-orange-500/10 scale-[1.02]'
              : 'border-[#2a2d3e] hover:border-[#363a52]'
            }
          `}
        >
          {/* Top row: job number + type badge */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs font-bold text-orange-400">
              #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-md border font-medium ${typeColor}`}>
              {jobTypeLabel(job.job_type)}
            </span>
          </div>

          {/* Client */}
          {job.clients?.name && (
            <p className="text-xs font-semibold text-[#f1f5f9] truncate mb-0.5">{job.clients.name}</p>
          )}

          {/* End Customer */}
          {job.end_customers?.name && (
            <p className="text-xs text-[#94a3b8] truncate mb-2">{job.end_customers.name}</p>
          )}

          {/* Serial */}
          {job.serial_number && (
            <p className="text-xs font-mono text-[#94a3b8]/70 truncate mb-2">{job.serial_number}</p>
          )}

          {/* Bottom row: date + staff */}
          <div className="flex items-center justify-between gap-2 mt-2">
            {job.scheduled_date ? (
              <div className="flex items-center gap-1 text-xs text-[#94a3b8]">
                <Calendar className="w-3 h-3" />
                {formatDate(job.scheduled_date)}
              </div>
            ) : (
              <span />
            )}
            {staffInitials && (
              <div className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-orange-400">{staffInitials}</span>
              </div>
            )}
            {!staffInitials && (
              <div className="w-6 h-6 rounded-full bg-[#2a2d3e] flex items-center justify-center shrink-0">
                <User className="w-3 h-3 text-[#94a3b8]/50" />
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  )
}

interface Props {
  initialJobs: Job[]
  onJobClick: (jobId: string) => void
}

export function KanbanBoard({ initialJobs, onJobClick }: Props) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [dragError, setDragError] = useState<string | null>(null)

  // Group jobs by status
  const byStatus = COLUMNS.reduce<Record<string, Job[]>>((acc, col) => {
    acc[col.id] = jobs.filter((j) => j.status === col.id)
    return acc
  }, {})

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId) return

    const newStatus = destination.droppableId as JobStatus
    setDragError(null)

    // Optimistic update
    setJobs((prev) =>
      prev.map((j) => (j.id === draggableId ? { ...j, status: newStatus } : j))
    )

    // Persist to DB
    try {
      const res = await fetch(`/api/jobs/${draggableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        // Revert and show error
        setJobs((prev) =>
          prev.map((j) => (j.id === draggableId ? { ...j, status: source.droppableId } : j))
        )
        setDragError('Failed to update job status. Change reverted.')
      }
    } catch (e) {
      console.error('Failed to update job status:', e)
      // Revert and show error
      setJobs((prev) =>
        prev.map((j) => (j.id === draggableId ? { ...j, status: source.droppableId } : j))
      )
      setDragError('Network error — job status change reverted.')
    }
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      {dragError && (
        <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
          {dragError}
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-220px)]">
        {COLUMNS.map((col) => {
          const colJobs = byStatus[col.id] ?? []
          return (
            <div
              key={col.id}
              className={`flex-shrink-0 w-64 flex flex-col rounded-xl border bg-[#0f1117] ${col.accent}`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2a2d3e]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
                  {col.label}
                </span>
                <span className="text-xs font-bold text-[#94a3b8] bg-[#2a2d3e] rounded-full w-5 h-5 flex items-center justify-center">
                  {colJobs.length}
                </span>
              </div>

              {/* Drop zone */}
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 p-2 space-y-2 overflow-y-auto kanban-column min-h-[100px] rounded-b-xl transition-colors ${
                      snapshot.isDraggingOver ? 'bg-[#1a1d27]' : ''
                    }`}
                  >
                    {colJobs.map((job, index) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        index={index}
                        onClick={() => onJobClick(job.id)}
                      />
                    ))}
                    {provided.placeholder}
                    {colJobs.length === 0 && !snapshot.isDraggingOver && (
                      <div className="text-xs text-[#94a3b8]/30 text-center py-4">
                        No jobs
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          )
        })}
      </div>
    </DragDropContext>
  )
}
