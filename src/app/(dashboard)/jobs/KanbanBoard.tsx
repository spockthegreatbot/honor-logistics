'use client'

import { useState, useRef, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Calendar, User } from 'lucide-react'
import { StatusBadge } from '@/components/ui/badge'
import { formatDate, jobTypeLabel, getInitials } from '@/lib/utils'
import { getClientColor, getClientShortName, BILLING_CLIENTS } from '@/lib/client-colors'

type JobStatus = 'new' | 'runup_pending' | 'runup_complete' | 'ready' | 'dispatched' | 'complete' | 'invoiced'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  order_types?: string[] | null
  status: string | null
  serial_number: string | null
  scheduled_date: string | null
  client_id?: string | null
  clients?: { name: string; color_code?: string | null } | null
  end_customers?: { name: string } | null
  machine_model?: string | null
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

/** Colored pill badge shown on each Kanban card */
function ClientBadge({ name, colorCode }: { name: string; colorCode?: string | null }) {
  const color = getClientColor(name, colorCode)
  const short = getClientShortName(name)
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold leading-tight"
      style={{
        backgroundColor: `${color}18`,
        border: `1px solid ${color}40`,
        color,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      {short}
    </span>
  )
}

function JobCard({
  job,
  index,
  onClick,
  onStatusChange,
}: {
  job: Job
  index: number
  onClick: () => void
  onStatusChange: (jobId: string, newStatus: JobStatus) => void
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const typeColor = JOB_TYPE_COLORS[job.job_type] ?? 'bg-[#2a2d3e] border-[#363a52] text-[#94a3b8]'
  const staffInitials = job.staff?.name ? getInitials(job.staff.name) : null
  const clientName = job.clients?.name
  const clientColor = getClientColor(clientName, job.clients?.color_code)

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  return (
    <Draggable draggableId={job.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`
            rounded-xl border bg-[#1e2130] cursor-pointer
            transition-all duration-150 group
            ${snapshot.isDragging
              ? 'border-orange-500/50 shadow-lg shadow-orange-500/10 scale-[1.02]'
              : 'border-[#2a2d3e] hover:border-[#363a52]'
            }
          `}
          style={{
            borderLeft: clientName ? `3px solid ${clientColor}` : undefined,
            position: 'relative',
          }}
        >
          <div className="p-3">
            {/* Top row: job number + type badge + status button */}
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs font-bold text-orange-400">
                #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
              </span>
              <div className="flex items-center gap-1">
                <span className={`text-xs px-1.5 py-0.5 rounded-md border font-medium ${typeColor} whitespace-nowrap`}>
                  {job.order_types && job.order_types.length > 0
                    ? job.order_types.map(t => ({ delivery:'Delivery', installation:'Install', pickup:'Pick-Up', relocation:'Reloc' })[t] ?? t).join('+')
                    : jobTypeLabel(job.job_type)}
                </span>
                {/* Status dropdown trigger */}
                <div ref={dropdownRef} style={{ position: 'relative' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDropdownOpen((o) => !o)
                    }}
                    title="Change status"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      border: '1px solid #363a52',
                      background: dropdownOpen ? '#2a2d3e' : 'transparent',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '14px',
                      lineHeight: 1,
                      padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    ⋮
                  </button>
                  {dropdownOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        top: '24px',
                        right: 0,
                        zIndex: 50,
                        background: '#1a1d27',
                        border: '1px solid #363a52',
                        borderRadius: '8px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                        minWidth: '148px',
                        padding: '4px',
                      }}
                    >
                      {COLUMNS.map((col) => {
                        const isCurrent = job.status === col.id
                        return (
                          <button
                            key={col.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setDropdownOpen(false)
                              if (!isCurrent) onStatusChange(job.id, col.id)
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              width: '100%',
                              padding: '5px 8px',
                              borderRadius: '5px',
                              border: 'none',
                              background: isCurrent ? '#2a2d3e' : 'transparent',
                              color: isCurrent ? '#f1f5f9' : '#94a3b8',
                              fontSize: '11px',
                              fontWeight: isCurrent ? 600 : 400,
                              cursor: isCurrent ? 'default' : 'pointer',
                              textAlign: 'left',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {isCurrent && (
                              <span style={{ color: '#f97316', fontSize: '10px' }}>✓</span>
                            )}
                            {!isCurrent && <span style={{ width: '10px', display: 'inline-block' }} />}
                            {col.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Client badge */}
            {clientName && (
              <div className="mb-1.5">
                <ClientBadge name={clientName} colorCode={job.clients?.color_code} />
              </div>
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
              {staffInitials ? (
                <div className="w-6 h-6 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-orange-400">{staffInitials}</span>
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-[#2a2d3e] flex items-center justify-center shrink-0">
                  <User className="w-3 h-3 text-[#94a3b8]/50" />
                </div>
              )}
            </div>
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
  const [clientFilter, setClientFilter] = useState<string | null>(null)

  async function handleStatusChange(jobId: string, newStatus: JobStatus) {
    const prev = jobs.find((j) => j.id === jobId)?.status
    setDragError(null)
    setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j)))
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, status: prev ?? null } : j)))
        setDragError('Failed to update job status. Change reverted.')
      }
    } catch {
      setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, status: prev ?? null } : j)))
      setDragError('Network error — job status change reverted.')
    }
  }

  // Determine which billing clients actually appear in the job list
  const presentClients = BILLING_CLIENTS.filter((c) =>
    jobs.some((j) => j.clients?.name === c)
  )

  // Apply client filter
  const visibleJobs = clientFilter
    ? jobs.filter((j) => j.clients?.name === clientFilter)
    : jobs

  // Group by status
  const byStatus = COLUMNS.reduce<Record<string, Job[]>>((acc, col) => {
    acc[col.id] = visibleJobs.filter((j) => j.status === col.id)
    return acc
  }, {})

  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result
    if (!destination) return
    if (destination.droppableId === source.droppableId) return

    const newStatus = destination.droppableId as JobStatus
    setDragError(null)

    setJobs((prev) =>
      prev.map((j) => (j.id === draggableId ? { ...j, status: newStatus } : j))
    )

    try {
      const res = await fetch(`/api/jobs/${draggableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        setJobs((prev) =>
          prev.map((j) => (j.id === draggableId ? { ...j, status: source.droppableId } : j))
        )
        setDragError('Failed to update job status. Change reverted.')
      }
    } catch {
      setJobs((prev) =>
        prev.map((j) => (j.id === draggableId ? { ...j, status: source.droppableId } : j))
      )
      setDragError('Network error — job status change reverted.')
    }
  }

  return (
    <div className="space-y-3">
      {/* Client filter chips */}
      {presentClients.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setClientFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
              clientFilter === null
                ? 'bg-[#f1f5f9] text-[#0f1117] border-[#f1f5f9]'
                : 'bg-transparent text-[#94a3b8] border-[#2a2d3e] hover:border-[#4a4d5e] hover:text-[#f1f5f9]'
            }`}
          >
            All
          </button>
          {presentClients.map((clientName) => {
            // Find a job for this client to get color_code if available
            const sampleJob = jobs.find((j) => j.clients?.name === clientName)
            const color = getClientColor(clientName, sampleJob?.clients?.color_code)
            const isActive = clientFilter === clientName
            const jobCount = jobs.filter((j) => j.clients?.name === clientName).length
            return (
              <button
                key={clientName}
                onClick={() => setClientFilter(isActive ? null : clientName)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all"
                style={
                  isActive
                    ? {
                        backgroundColor: `${color}20`,
                        borderColor: color,
                        color,
                      }
                    : {
                        backgroundColor: 'transparent',
                        borderColor: '#2a2d3e',
                        color: '#94a3b8',
                      }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = color
                    e.currentTarget.style.color = color
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = '#2a2d3e'
                    e.currentTarget.style.color = '#94a3b8'
                  }
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                {clientName}
                <span
                  className="ml-0.5 px-1 rounded text-[10px] font-bold"
                  style={{ backgroundColor: `${color}25`, color }}
                >
                  {jobCount}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        {dragError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
            {dragError}
          </div>
        )}
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-260px)]">
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
                          onStatusChange={handleStatusChange}
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
    </div>
  )
}
