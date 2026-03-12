'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { Calendar, User, Trash2, CheckSquare, Square } from 'lucide-react'
import { formatDate, getInitials } from '@/lib/utils'
import { getClientColor, getClientShortName, BILLING_CLIENTS } from '@/lib/client-colors'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BoardColumn =
  | 'delivery'
  | 'install'
  | 'delivery_install'
  | 'relocation_install'
  | 'pickup'
  | 'runup'
  | 'done'
  | 'archived'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  order_types?: string[] | null
  status: string | null
  serial_number: string | null
  scheduled_date: string | null
  address_to?: string | null
  client_id?: string | null
  clients?: { name: string; color_code?: string | null } | null
  end_customers?: { name: string; address?: string | null } | null
  machine_model?: string | null
  staff?: { name: string } | null
  runup_details?: { check_signed_off: boolean | null } | null
  archived?: boolean | null
  runup_completed?: boolean | null
  board_column?: string | null
}

// ─── Column definitions ──────────────────────────────────────────────────────

const COLUMNS: { id: BoardColumn; label: string; accent: string; headerColor: string }[] = [
  { id: 'delivery',           label: 'Delivery',            accent: 'border-blue-500/40',    headerColor: 'text-blue-400' },
  { id: 'install',            label: 'Install',             accent: 'border-green-500/40',   headerColor: 'text-green-400' },
  { id: 'delivery_install',   label: 'Delivery + Install',  accent: 'border-cyan-500/40',    headerColor: 'text-cyan-400' },
  { id: 'relocation_install', label: 'Relocation + Install',accent: 'border-purple-500/40',  headerColor: 'text-purple-400' },
  { id: 'pickup',             label: 'Pickup',              accent: 'border-orange-500/40',  headerColor: 'text-orange-400' },
  { id: 'runup',              label: 'Run-Ups',             accent: 'border-amber-500/40',   headerColor: 'text-amber-400' },
  { id: 'done',               label: 'Done',                accent: 'border-emerald-500/40', headerColor: 'text-emerald-400' },
  { id: 'archived',           label: 'Archived',            accent: 'border-slate-600/40',   headerColor: 'text-slate-500' },
]

// ─── Column mapping from job_type / order_types ──────────────────────────────

function deriveColumn(job: Job): string | null {
  if (job.job_type === 'toner') return null // toner jobs are off the board
  if (job.archived) return 'archived'
  if (job.board_column) return job.board_column

  // EFEX/Axus order_types take priority
  if (job.order_types && job.order_types.length > 0) {
    const types = new Set(job.order_types)
    if (types.has('relocation') && types.has('installation')) return 'relocation_install'
    if (types.has('delivery') && types.has('installation')) return 'delivery_install'
    if (types.has('installation')) return 'install'
    if (types.has('pickup')) return 'pickup'
    if (types.has('delivery')) return 'delivery'
  }

  switch (job.job_type) {
    case 'delivery':   return 'delivery'
    case 'install':    return 'install'
    case 'runup':      return 'runup'
    case 'collection': return 'pickup'
    case 'toner_ship': return 'delivery'
    case 'inwards':    return 'delivery'
    case 'outwards':   return 'delivery'
    case 'storage':    return 'delivery'
    default:           return 'delivery'
  }
}

// ─── Client badge ────────────────────────────────────────────────────────────

function ClientBadge({ name, colorCode }: { name: string; colorCode?: string | null }) {
  const color = getClientColor(name, colorCode)
  const short = getClientShortName(name)
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold leading-tight shrink-0"
      style={{ backgroundColor: `${color}18`, border: `1px solid ${color}40`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {short}
    </span>
  )
}

// ─── Job type label ───────────────────────────────────────────────────────────

const ORDER_TYPE_LABELS: Record<string, string> = {
  delivery: 'Delivery', installation: 'Install', pickup: 'Pick-Up', relocation: 'Reloc',
}

function jobTypeLabel(job: Job): string {
  if (job.order_types && job.order_types.length > 0) {
    return job.order_types.map(t => ORDER_TYPE_LABELS[t] ?? t).join('+')
  }
  const map: Record<string, string> = {
    runup: 'Run-Up', delivery: 'Delivery', collection: 'Collection', install: 'Install',
    inwards: 'Inwards', outwards: 'Outwards', toner_ship: 'Toner', storage: 'Storage',
  }
  return map[job.job_type] ?? job.job_type
}

// ─── Draggable job card ───────────────────────────────────────────────────────

interface CardProps {
  job: Job
  isDragging?: boolean
  onClick: () => void
  onArchive: (jobId: string) => void
  onRunupToggle: (jobId: string, value: boolean) => void
}

function JobCard({ job, isDragging = false, onClick, onArchive, onRunupToggle }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging: selfDragging } = useDraggable({ id: job.id })

  const clientName = job.clients?.name
  const clientColor = getClientColor(clientName, job.clients?.color_code)
  const staffInitials = job.staff?.name ? getInitials(job.staff.name) : null
  const isArchived = job.archived ?? false
  const runupDone = job.runup_completed ?? false

  // Address display: prefer address_to, then end_customer address
  const addrRaw = job.address_to || job.end_customers?.address || null
  const addrShort = addrRaw ? addrRaw.split(',').slice(-2).join(',').trim() : null

  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: selfDragging ? 0 : 1,
    borderLeft: clientName ? `3px solid ${clientColor}` : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        rounded-xl border bg-[#1e2130] cursor-grab active:cursor-grabbing
        transition-shadow duration-150 group select-none
        ${isDragging ? 'border-orange-500/50 shadow-lg shadow-orange-500/10' : 'border-[#2a2d3e] hover:border-[#363a52]'}
        ${isArchived ? 'opacity-60' : ''}
      `}
      onClick={(e) => {
        // Don't open slide-over if clicking action buttons
        if ((e.target as HTMLElement).closest('[data-action]')) return
        onClick()
      }}
    >
      <div className="p-3">
        {/* Top row: job number + trash */}
        <div className="flex items-start justify-between mb-2 gap-1">
          <span className="font-mono text-xs font-bold text-orange-400 leading-tight">
            #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
          </span>
          <button
            data-action="archive"
            onClick={(e) => { e.stopPropagation(); onArchive(job.id) }}
            title={isArchived ? 'Archived' : 'Archive job'}
            className={`
              shrink-0 p-0.5 rounded transition-colors
              ${isArchived
                ? 'text-slate-500 cursor-default'
                : 'text-[#94a3b8]/40 hover:text-red-400 opacity-0 group-hover:opacity-100'}
            `}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {/* Type badge + client badge */}
        <div className="flex items-center gap-1 flex-wrap mb-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded-md border font-medium bg-[#2a2d3e] border-[#363a52] text-[#94a3b8] whitespace-nowrap">
            {jobTypeLabel(job)}
          </span>
          {clientName && <ClientBadge name={clientName} colorCode={job.clients?.color_code} />}
        </div>

        {/* Customer / address */}
        {job.end_customers?.name && (
          <p className="text-xs text-[#94a3b8] truncate mb-1">{job.end_customers.name}</p>
        )}
        {addrShort && (
          <p className="text-[11px] text-[#94a3b8]/60 truncate mb-1">{addrShort}</p>
        )}

        {/* Serial */}
        {job.serial_number && (
          <p className="text-xs font-mono text-[#94a3b8]/50 truncate mb-1">{job.serial_number}</p>
        )}

        {/* Bottom row: date + runup checkbox + driver */}
        <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-[#2a2d3e]/50">
          {/* Date */}
          {job.scheduled_date ? (
            <div className="flex items-center gap-1 text-xs text-[#94a3b8]">
              <Calendar className="w-3 h-3 shrink-0" />
              {formatDate(job.scheduled_date)}
            </div>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Runup checkbox */}
            <button
              data-action="runup"
              onClick={(e) => { e.stopPropagation(); onRunupToggle(job.id, !runupDone) }}
              title="Runup completed"
              className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${
                runupDone ? 'text-emerald-400' : 'text-[#94a3b8]/50 hover:text-[#94a3b8]'
              }`}
            >
              {runupDone
                ? <CheckSquare className="w-3.5 h-3.5" />
                : <Square className="w-3.5 h-3.5" />
              }
              <span className={runupDone ? 'line-through text-emerald-400/80' : ''}>Runup</span>
            </button>

            {/* Driver avatar */}
            {staffInitials ? (
              <div className="w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/30 flex items-center justify-center">
                <span className="text-[9px] font-bold text-orange-400">{staffInitials}</span>
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-[#2a2d3e] flex items-center justify-center">
                <User className="w-2.5 h-2.5 text-[#94a3b8]/40" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Drop column ──────────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  jobs,
  isOver,
  onJobClick,
  onArchive,
  onRunupToggle,
}: {
  col: typeof COLUMNS[number]
  jobs: Job[]
  isOver: boolean
  onJobClick: (id: string) => void
  onArchive: (id: string) => void
  onRunupToggle: (id: string, val: boolean) => void
}) {
  const { setNodeRef } = useDroppable({ id: col.id })
  const isArchived = col.id === 'archived'

  return (
    <div
      className={`
        flex-shrink-0 w-64 flex flex-col rounded-xl border bg-[#0f1117]
        ${col.accent}
        ${isArchived ? 'opacity-70' : ''}
      `}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2a2d3e]">
        <span className={`text-xs font-semibold uppercase tracking-wider ${col.headerColor}`}>
          {col.label}
        </span>
        <span className="text-xs font-bold text-[#94a3b8] bg-[#2a2d3e] rounded-full w-5 h-5 flex items-center justify-center">
          {jobs.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`
          flex-1 p-2 space-y-2 overflow-y-auto min-h-[80px] rounded-b-xl transition-colors
          ${isOver ? 'bg-[#1a1d27]' : ''}
        `}
      >
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onClick={() => onJobClick(job.id)}
            onArchive={onArchive}
            onRunupToggle={onRunupToggle}
          />
        ))}
        {jobs.length === 0 && !isOver && (
          <div className="text-xs text-[#94a3b8]/25 text-center py-6">
            {isArchived ? 'No archived jobs' : 'Drop here'}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Drag overlay card (ghost while dragging) ─────────────────────────────────

function DragOverlayCard({ job }: { job: Job }) {
  const clientName = job.clients?.name
  const clientColor = getClientColor(clientName, job.clients?.color_code)
  return (
    <div
      className="rounded-xl border border-orange-500/50 bg-[#1e2130] shadow-2xl shadow-orange-500/20 w-56 rotate-1"
      style={{ borderLeft: clientName ? `3px solid ${clientColor}` : undefined }}
    >
      <div className="p-3">
        <span className="font-mono text-xs font-bold text-orange-400">
          #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
        </span>
        {clientName && (
          <div className="mt-1.5">
            <ClientBadge name={clientName} colorCode={job.clients?.color_code} />
          </div>
        )}
        {job.end_customers?.name && (
          <p className="text-xs text-[#94a3b8] truncate mt-1">{job.end_customers.name}</p>
        )}
      </div>
    </div>
  )
}

// ─── Main Board ───────────────────────────────────────────────────────────────

interface Props {
  initialJobs: Job[]
  onJobClick: (jobId: string) => void
}

export function KanbanBoard({ initialJobs, onJobClick }: Props) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  const [dragError, setDragError] = useState<string | null>(null)
  const [clientFilter, setClientFilter] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const activeJob = jobs.find(j => j.id === activeJobId) ?? null

  // Auto-archive jobs with past scheduled_date on mount
  useEffect(() => {
    fetch('/api/jobs/archive-past', { method: 'POST' })
      .then(r => r.json())
      .then((data: { archived?: number }) => {
        if (data.archived && data.archived > 0) {
          // Mark matching jobs as archived in local state
          const today = new Date().toISOString().slice(0, 10)
          setJobs(prev => prev.map(j => {
            if (
              j.archived ||
              !j.scheduled_date ||
              j.scheduled_date >= today
            ) return j
            const status = (j.status ?? '').toLowerCase()
            if (['done', 'complete', 'completed', 'invoiced', 'cancelled'].includes(status)) return j
            return { ...j, archived: true }
          }))
        }
      })
      .catch(() => {/* silent — non-critical */})
  }, [])

  // Determine which billing clients appear in job list
  const presentClients = BILLING_CLIENTS.filter(c =>
    jobs.some(j => j.clients?.name === c)
  )

  // Apply client filter
  const visibleJobs = clientFilter
    ? jobs.filter(j => j.clients?.name === clientFilter)
    : jobs

  // Group jobs by derived column, sorted earliest scheduled_date first (nulls last)
  const byColumn = COLUMNS.reduce<Record<string, Job[]>>((acc, col) => {
    const colJobs = visibleJobs.filter(j => {
      if (col.id === 'archived') return j.archived === true
      return !j.archived && deriveColumn(j) === col.id
    })
    colJobs.sort((a, b) => {
      if (!a.scheduled_date && !b.scheduled_date) return 0
      if (!a.scheduled_date) return 1
      if (!b.scheduled_date) return -1
      return a.scheduled_date.localeCompare(b.scheduled_date)
    })
    acc[col.id] = colJobs
    return acc
  }, {})

  // ── Archive / unarchive ────────────────────────────────────────────────────

  const handleArchive = useCallback(async (jobId: string) => {
    const job = jobs.find(j => j.id === jobId)
    if (!job) return
    const newArchived = !(job.archived ?? false)
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, archived: newArchived } : j))
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: newArchived }),
      })
      if (!res.ok) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, archived: job.archived ?? false } : j))
        setDragError('Failed to archive job.')
      }
    } catch {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, archived: job.archived ?? false } : j))
      setDragError('Network error — archive failed.')
    }
  }, [jobs])

  // ── Runup toggle ───────────────────────────────────────────────────────────

  const handleRunupToggle = useCallback(async (jobId: string, value: boolean) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, runup_completed: value } : j))
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runup_completed: value }),
      })
      if (!res.ok) {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, runup_completed: !value } : j))
        setDragError('Failed to save runup status.')
      }
    } catch {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, runup_completed: !value } : j))
    }
  }, [])

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragStart({ active }: DragStartEvent) {
    setActiveJobId(active.id as string)
    setDragError(null)
  }

  function handleDragOver({ over }: { over: { id: string | number } | null }) {
    setOverColumnId(over ? (over.id as string) : null)
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveJobId(null)
    setOverColumnId(null)
    if (!over) return

    const jobId = active.id as string
    const targetColId = over.id as string
    const job = jobs.find(j => j.id === jobId)
    if (!job) return

    const currentCol = deriveColumn(job)
    if (targetColId === currentCol) return

    // Optimistic update
    const isTargetArchived = targetColId === 'archived'
    setJobs(prev => prev.map(j =>
      j.id === jobId
        ? { ...j, board_column: isTargetArchived ? j.board_column : targetColId, archived: isTargetArchived }
        : j
    ))

    try {
      const body: Record<string, unknown> = {}
      if (isTargetArchived) {
        body.archived = true
      } else {
        body.board_column = targetColId
        body.archived = false
      }

      const res = await fetch(`/api/jobs/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        // Revert
        setJobs(prev => prev.map(j =>
          j.id === jobId
            ? { ...j, board_column: job.board_column ?? null, archived: job.archived ?? false }
            : j
        ))
        setDragError('Failed to move job. Change reverted.')
      }
    } catch {
      setJobs(prev => prev.map(j =>
        j.id === jobId
          ? { ...j, board_column: job.board_column ?? null, archived: job.archived ?? false }
          : j
      ))
      setDragError('Network error — move reverted.')
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
          {presentClients.map(clientName => {
            const sampleJob = jobs.find(j => j.clients?.name === clientName)
            const color = getClientColor(clientName, sampleJob?.clients?.color_code)
            const isActive = clientFilter === clientName
            const jobCount = jobs.filter(j => j.clients?.name === clientName).length
            return (
              <button
                key={clientName}
                onClick={() => setClientFilter(isActive ? null : clientName)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all"
                style={
                  isActive
                    ? { backgroundColor: `${color}20`, borderColor: color, color }
                    : { backgroundColor: 'transparent', borderColor: '#2a2d3e', color: '#94a3b8' }
                }
                onMouseEnter={e => {
                  if (!isActive) { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color }
                }}
                onMouseLeave={e => {
                  if (!isActive) { e.currentTarget.style.borderColor = '#2a2d3e'; e.currentTarget.style.color = '#94a3b8' }
                }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {clientName}
                <span className="ml-0.5 px-1 rounded text-[10px] font-bold" style={{ backgroundColor: `${color}25`, color }}>
                  {jobCount}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {dragError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
          {dragError}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-280px)]">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              col={col}
              jobs={byColumn[col.id] ?? []}
              isOver={overColumnId === col.id}
              onJobClick={onJobClick}
              onArchive={handleArchive}
              onRunupToggle={handleRunupToggle}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeJob ? <DragOverlayCard job={activeJob} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
