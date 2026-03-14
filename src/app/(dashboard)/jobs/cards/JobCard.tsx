'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Phone, Trash2, ChevronDown, ChevronUp, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBar } from '../StatusBar'
import { QuickActionButton } from './QuickActionButton'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  order_types?: string[] | null
  status: string | null
  serial_number?: string | null
  scheduled_date?: string | null
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
  booking_form_url?: string | null
  install_pdf_url?: string | null
  runup_completed?: boolean | null
  machine_details?: string | null
  clients?: { name: string; color_code?: string | null } | null
  end_customers?: { name: string } | null
  staff?: { name: string } | null
}

interface JobCardProps {
  job: Job
  onClick: (id: string) => void
  onStatusChange: (jobId: string, newStatus: string) => void
  onDelete: (jobId: string) => void
  selectable?: boolean
  selected?: boolean
  onSelect?: (jobId: string) => void
}

// Human-readable labels for field keys
const FIELD_LABELS: Record<string, string> = {
  scheduled_date: 'Scheduled',
  contact_name: 'Contact',
  contact_phone: 'Phone',
  address_to: 'Delivery Address',
  address_from: 'Pickup Address',
  machine_model: 'Machine',
  serial_number: 'Serial',
  machine_accessories: 'Accessories',
  po_number: 'PO Number',
  tracking_number: 'Tracking',
  pickup_model: 'Pickup Model',
  pickup_serial: 'Pickup Serial',
  pickup_disposition: 'Disposition',
  machine_details: 'Machine Details',
  notes: 'Notes',
  order_types: 'Order Types',
  stair_walker: 'Stairs',
  parking: 'Parking',
  install_pdf_url: 'Install PDF',
}

const JOB_TYPE_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  install: 'Install',
  installation: 'Installation',
  collection: 'Collection',
  relocation: 'Relocation',
  relocation_install: 'Relocation + Install',
  inwards: 'Inwards',
  outwards: 'Outwards',
  storage: 'Storage',
  toner_ship: 'Toner Ship',
  runup: 'Run-Up',
}

// Fields to skip in the generic iteration (shown elsewhere or internal)
const SKIP_FIELDS = new Set([
  'id', 'job_number', 'job_type', 'status', 'clients', 'end_customers', 'staff',
  'special_instructions', 'has_aod', 'aod_pdf_url', 'aod_signed_at',
  'signed_aod_url', 'signed_aod_at', 'archived', 'runup_completed',
  'contact_phone', // shown inline with contact_name
  'booking_form_url', // shown in attachment pills
])

function tryParseJson(str: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(str)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return null
  } catch {
    return null
  }
}

function formatFieldValue(key: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '' || value === false) return null

  if (key === 'stair_walker') return '🪜 Yes'
  if (key === 'parking') return '🅿️ Yes'
  if (value === true) return 'Yes'

  if (key === 'install_pdf_url' && typeof value === 'string') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="text-[#f97316] hover:text-[#fb923c] underline transition"
      >
        Open PDF
      </a>
    )
  }

  if (Array.isArray(value)) {
    const labels = value.map(v => JOB_TYPE_LABELS[v as string] ?? String(v))
    return labels.join(', ')
  }

  return String(value)
}

export function JobCard({ job, onClick, onStatusChange, onDelete, selectable, selected, onSelect }: JobCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }
  }, [])

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmDelete(true)
    confirmTimer.current = setTimeout(() => setConfirmDelete(false), 4000)
  }

  async function handleConfirmDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setDeleting(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDelete(job.id)
      } else {
        const d = await res.json()
        alert(d.error ?? 'Delete failed')
      }
    } catch {
      alert('Network error')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    setConfirmDelete(false)
  }

  // Client badge
  const clientName = job.clients?.name ?? job.job_type
  const clientColor = job.clients?.color_code ?? '#6b7280'

  // Job type label
  const jobTypeLabel = job.order_types?.length
    ? job.order_types.map(t => JOB_TYPE_LABELS[t] ?? t).join(' + ')
    : JOB_TYPE_LABELS[job.job_type] ?? job.job_type

  // Status bar type
  const statusType = job.job_type === 'runup' ? 'runup' : 'efex'

  // Build displayable fields from job data
  const displayFields = useMemo(() => {
    const fields: { label: string; value: React.ReactNode }[] = []
    const jobRecord = job as unknown as Record<string, unknown>

    for (const [key, value] of Object.entries(jobRecord)) {
      if (SKIP_FIELDS.has(key)) continue
      const formatted = formatFieldValue(key, value)
      if (formatted === null) continue

      const label = FIELD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

      // For contact_name, append phone inline
      if (key === 'contact_name' && job.contact_phone) {
        fields.push({
          label,
          value: (
            <span className="flex items-center gap-2 flex-wrap">
              <span>{String(value)}</span>
              <a
                href={`tel:${job.contact_phone}`}
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[#f97316] hover:text-[#fb923c] transition"
              >
                <Phone className="w-3 h-3" />
                {job.contact_phone}
              </a>
            </span>
          ),
        })
        continue
      }

      fields.push({ label, value: formatted })
    }

    return fields
  }, [job])

  // Special instructions handling
  const parsedInstructions = useMemo(() => {
    if (!job.special_instructions) return null
    const jsonData = tryParseJson(job.special_instructions)
    if (jsonData) return { type: 'json' as const, data: jsonData }
    return { type: 'text' as const, data: job.special_instructions }
  }, [job.special_instructions])

  return (
    <div
      className={cn(
        'bg-[#1e2130] rounded-xl border shadow-sm hover:border-[#3a3d4e] transition-colors cursor-pointer relative',
        selectable && selected ? 'border-[#f97316] ring-1 ring-[#f97316]/30' : 'border-[#2a2d3e]'
      )}
      onClick={() => onClick(job.id)}
    >
      {selectable && (
        <div className="absolute top-3 left-3 z-10" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={() => onSelect?.(job.id)}
            className="w-4 h-4 rounded border-[#2a2d3e] bg-[#0f1117] text-[#f97316] focus:ring-[#f97316] focus:ring-offset-0 cursor-pointer accent-[#f97316]"
          />
        </div>
      )}
      <div className={cn('p-4 md:p-5 space-y-3', selectable && 'pl-10 md:pl-11')}>
        {/* Header: job number + client badge + job type + delete */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide"
              style={{ backgroundColor: clientColor, color: '#0f1117' }}
            >
              {clientName}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border border-[#2a2d3e] text-[#94a3b8]">
              {jobTypeLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-[#6b7280]">
              {job.job_number ? `#${job.job_number.replace('HRL-', '')}` : ''}
            </span>
            {confirmDelete ? (
              <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <button
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="text-[10px] font-semibold text-red-400 hover:text-red-300 transition px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30"
                >
                  {deleting ? '…' : 'Confirm'}
                </button>
                <button
                  onClick={handleCancelDelete}
                  className="text-[10px] font-semibold text-[#94a3b8] hover:text-[#f1f5f9] transition px-1.5 py-0.5"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={handleDeleteClick}
                className="p-1 rounded text-[#6b7280] hover:text-red-400 hover:bg-red-500/10 transition"
                title="Delete job"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Attachment pills */}
        {(job.booking_form_url || job.install_pdf_url || job.aod_pdf_url) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {job.booking_form_url && (
              <a
                href={job.booking_form_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f97316]/15 text-[#f97316] hover:bg-[#f97316]/25 border border-[#f97316]/30 transition"
              >
                <Paperclip className="w-3 h-3" />
                Booking Form
              </a>
            )}
            {job.install_pdf_url && (
              <a
                href={job.install_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f97316]/15 text-[#f97316] hover:bg-[#f97316]/25 border border-[#f97316]/30 transition"
              >
                <Paperclip className="w-3 h-3" />
                Packing List
              </a>
            )}
            {job.aod_pdf_url && (
              <a
                href={job.aod_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#f97316]/15 text-[#f97316] hover:bg-[#f97316]/25 border border-[#f97316]/30 transition"
              >
                <Paperclip className="w-3 h-3" />
                AOD
              </a>
            )}
          </div>
        )}

        {/* Customer / end customer name */}
        {(job.end_customers?.name || job.contact_name) && (
          <h3 className="text-lg font-bold text-[#f1f5f9] leading-tight line-clamp-2">
            {job.end_customers?.name || job.contact_name}
          </h3>
        )}

        {/* Dynamic fields */}
        <div className="space-y-1.5">
          {displayFields.map(({ label, value }) => (
            <div key={label} className="flex items-baseline gap-2 text-sm">
              <span className="text-[#6b7280] text-xs uppercase tracking-wide shrink-0">{label}</span>
              <span className="text-[#94a3b8]">{value}</span>
            </div>
          ))}
        </div>

        {/* Special instructions */}
        {parsedInstructions && (
          <div>
            <button
              onClick={e => { e.stopPropagation(); setShowInstructions(!showInstructions) }}
              className="flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-[#f1f5f9] transition"
            >
              {showInstructions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span className="font-medium">
                {showInstructions ? 'Hide details' : 'Show details'}
              </span>
            </button>
            {showInstructions && (
              <div className="mt-1.5 text-xs bg-[#151826] rounded-lg p-3 space-y-1">
                {parsedInstructions.type === 'json' ? (
                  Object.entries(parsedInstructions.data).map(([k, v]) => {
                    if (v === null || v === undefined || v === '') return null
                    const label = k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                    // Arrays (like lineItems) — render as compact list
                    if (Array.isArray(v)) {
                      return (
                        <div key={k}>
                          <span className="text-[#6b7280]">{label}:</span>
                          <div className="pl-3 mt-0.5 space-y-0.5">
                            {v.map((item, i) => (
                              <div key={i} className="text-[#94a3b8]">
                                {typeof item === 'object'
                                  ? Object.entries(item as Record<string, unknown>)
                                      .filter(([, val]) => val !== null && val !== undefined && val !== '')
                                      .map(([ik, iv]) => `${ik}: ${Array.isArray(iv) ? (iv as string[]).join(', ') : String(iv)}`)
                                      .join(' · ')
                                  : String(item)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={k} className="flex items-baseline gap-2">
                        <span className="text-[#6b7280]">{label}:</span>
                        <span className="text-[#94a3b8]">{String(v)}</span>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-[#94a3b8] whitespace-pre-wrap">{parsedInstructions.data as string}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Driver avatar */}
        {job.staff?.name && (
          <div className="flex justify-end">
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#2a2d3e] text-[11px] font-bold text-[#94a3b8] uppercase"
              title={job.staff.name}
            >
              {job.staff.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </span>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-4 pb-4 md:px-5 md:pb-5 space-y-2">
        <StatusBar
          type={statusType}
          currentStatus={job.status ?? 'new'}
          jobId={job.id}
          onStatusChange={onStatusChange}
        />
        <QuickActionButton
          jobId={job.id}
          currentStatus={job.status ?? 'new'}
          type={statusType}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  )
}
