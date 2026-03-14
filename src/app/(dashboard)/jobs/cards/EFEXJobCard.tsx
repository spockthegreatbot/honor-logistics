'use client'

import { useState, useEffect, useRef } from 'react'
import { Phone, AlertTriangle, ChevronDown, ChevronUp, PenLine, CheckCircle2, Trash2, Paperclip } from 'lucide-react'
// AlertTriangle kept for missing-data states only
import { cn, formatDateTime } from '@/lib/utils'
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
  booking_form_url?: string | null
  install_pdf_url?: string | null
  po_number?: string | null
  notes?: string | null
  tracking_number?: string | null
  clients?: { name: string; color_code?: string | null } | null
  end_customers?: { name: string } | null
  staff?: { name: string } | null
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
}

function getJobTypeLabel(job: Job): string {
  if (job.order_types && job.order_types.length > 0) {
    return job.order_types.map(t => JOB_TYPE_LABELS[t] ?? t).join(' + ')
  }
  return JOB_TYPE_LABELS[job.job_type] ?? job.job_type
}

function isCollectionType(job: Job): boolean {
  const types = job.order_types ?? [job.job_type]
  return types.includes('collection') || types.includes('pickup')
}

interface EFEXJobCardProps {
  job: Job
  onClick: (id: string) => void
  onStatusChange: (jobId: string, newStatus: string) => void
  onAodClick?: (jobId: string) => void
  onDelete: (jobId: string) => void
  selectable?: boolean
  selected?: boolean
  onSelect?: (jobId: string) => void
}

export function EFEXJobCard({ job, onClick, onStatusChange, onAodClick, onDelete, selectable, selected, onSelect }: EFEXJobCardProps) {
  const [showAllAccessories, setShowAllAccessories] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
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

  const customerName = job.end_customers?.name || job.contact_name || 'Unknown Customer'
  const address = isCollectionType(job) ? job.address_from : job.address_to
  const accessories = job.machine_accessories
    ? job.machine_accessories.split(',').map(a => a.trim()).filter(Boolean)
    : []

  const showAodButton = job.has_aod && !job.signed_aod_at
  const showAodSigned = job.has_aod && job.signed_aod_at

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
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#f97316] text-[#0f1117] uppercase tracking-wide">
              EFEX
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border border-[#2a2d3e] text-[#94a3b8]">
              {getJobTypeLabel(job)}
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

        {/* Customer name */}
        <h3 className="text-lg font-bold text-[#f1f5f9] leading-tight line-clamp-2">
          {customerName}
        </h3>

        {/* Address */}
        {address ? (
          <p className="text-sm text-[#94a3b8] leading-relaxed">{address}</p>
        ) : (
          <p className="text-sm text-red-300 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            Address — Missing
          </p>
        )}

        {/* Machine block */}
        <div className="space-y-1">
          {isCollectionType(job) ? (
            <>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs text-[#6b7280] uppercase tracking-wide">Pickup</span>
                <span className="text-sm font-semibold text-[#f1f5f9]">
                  {job.pickup_model || 'Model — Not provided'}
                </span>
                <span className="text-sm font-mono text-[#94a3b8]">
                  {job.pickup_serial || <span className="text-red-300">Serial — Not provided</span>}
                </span>
              </div>
              {job.pickup_disposition && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#374151] text-[#cbd5e1]">
                  {job.pickup_disposition}
                </span>
              )}
            </>
          ) : (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[#f1f5f9]">
                {job.machine_model || 'Model — Not provided'}
              </span>
              <span className="text-sm font-mono text-[#94a3b8]">
                {job.serial_number || <span className="text-red-300">Serial — Not provided</span>}
              </span>
            </div>
          )}
        </div>

        {/* Accessories */}
        {accessories.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {(showAllAccessories ? accessories : accessories.slice(0, 2)).map((acc, i) => (
              <span key={i} className="text-xs text-[#94a3b8] bg-[#2a2d3e] rounded px-1.5 py-0.5">
                {acc}
              </span>
            ))}
            {!showAllAccessories && accessories.length > 2 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAllAccessories(true) }}
                className="text-xs text-[#f97316] hover:text-[#fb923c] font-medium transition"
              >
                +{accessories.length - 2} more
              </button>
            )}
            {showAllAccessories && accessories.length > 2 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAllAccessories(false) }}
                className="text-xs text-[#f97316] hover:text-[#fb923c] font-medium transition"
              >
                Show less
              </button>
            )}
          </div>
        )}

        {/* Flags row */}
        <div className="flex items-center gap-2 flex-wrap">
          {job.contact_name && (
            <span className="text-xs text-[#94a3b8]">
              {job.contact_name}
              {job.contact_phone ? (
                <a
                  href={`tel:${job.contact_phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 ml-1.5 text-[#f97316] hover:text-[#fb923c] transition"
                >
                  <Phone className="w-3 h-3" />
                  {job.contact_phone}
                </a>
              ) : (
                <span className="ml-1.5 text-[#6b7280] text-[11px]">(no number)</span>
              )}
            </span>
          )}
          {job.stair_walker && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#3b1f23] text-[#fca5a5] border border-[#7f1d1d]">
              🪜 Stairs
            </span>
          )}
          {job.parking && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#3b2a1c] text-[#fbbf24] border border-[#92400e]">
              🅿️ Parking
            </span>
          )}
        </div>

        {/* Special instructions */}
        {job.special_instructions && job.job_type !== 'runup' && (
          <div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowInstructions(!showInstructions) }}
              className="flex items-center gap-1.5 text-xs text-[#94a3b8] hover:text-[#f1f5f9] transition"
            >
              {showInstructions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span className={showInstructions ? '' : 'line-clamp-1'}>
                {showInstructions ? 'Hide instructions' : job.special_instructions.slice(0, 80) + (job.special_instructions.length > 80 ? '...' : '')}
              </span>
            </button>
            {showInstructions && (
              <p className="mt-1 text-xs text-[#94a3b8] bg-[#151826] rounded-lg p-2 whitespace-pre-wrap">
                {job.special_instructions}
              </p>
            )}
          </div>
        )}

        {/* AOD row */}
        {showAodButton && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAodClick?.(job.id)
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#b91c1c] text-white font-semibold text-sm hover:bg-[#991b1b] transition animate-pulse"
          >
            <PenLine className="w-4 h-4" />
            Get AOD Signed
          </button>
        )}
        {showAodSigned && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#065f46] text-[#d1fae5]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            AOD Signed • {formatDateTime(job.signed_aod_at)}
          </span>
        )}

        {/* Driver */}
        {job.staff?.name && (
          <div className="flex justify-end">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#2a2d3e] text-[11px] font-bold text-[#94a3b8] uppercase" title={job.staff.name}>
              {job.staff.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </span>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="px-4 pb-4 md:px-5 md:pb-5 space-y-2">
        <StatusBar
          type="efex"
          currentStatus={job.status ?? 'new'}
          jobId={job.id}
          onStatusChange={onStatusChange}
        />
        <QuickActionButton
          jobId={job.id}
          currentStatus={job.status ?? 'new'}
          type="efex"
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  )
}
