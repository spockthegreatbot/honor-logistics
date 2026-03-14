'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Package, Calendar, Building2, ChevronDown, ChevronUp, FileText, ExternalLink, Trash2, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatusBar } from '../StatusBar'
import { QuickActionButton } from './QuickActionButton'

interface LineItem {
  itemCode?: string
  description?: string
  orderedQty?: number
  shippedQty?: number
  serialNumbers?: string[]
}

interface ParsedInstructions {
  shipDate?: string
  shipmentId?: string
  customerPO?: string
  connote?: string
  shipFrom?: string
  shipTo?: string
  lineItems?: LineItem[]
}

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
  clients?: { name: string; color_code?: string | null } | null
  end_customers?: { name: string } | null
  staff?: { name: string } | null
}

function safeParse(json: string | null | undefined): ParsedInstructions | null {
  if (!json) return null
  try {
    return JSON.parse(json) as ParsedInstructions
  } catch {
    return null
  }
}

interface RunUpCardProps {
  job: Job
  onClick: (id: string) => void
  onStatusChange: (jobId: string, newStatus: string) => void
  onDelete: (jobId: string) => void
  selectable?: boolean
  selected?: boolean
  onSelect?: (jobId: string) => void
}

export function RunUpCard({ job, onClick, onStatusChange, onDelete, selectable, selected, onSelect }: RunUpCardProps) {
  const [showMachines, setShowMachines] = useState(false)
  const [showPackingList, setShowPackingList] = useState(false)
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

  const parsed = useMemo(() => safeParse(job.special_instructions), [job.special_instructions])
  const connote = job.tracking_number || parsed?.connote

  // Build machines list from primary + lineItems with serials
  const machines = useMemo(() => {
    const list: { model: string; serial: string }[] = []
    if (job.machine_model || job.serial_number) {
      list.push({
        model: job.machine_model || 'Unknown Model',
        serial: job.serial_number || 'No Serial',
      })
    }
    if (parsed?.lineItems) {
      for (const item of parsed.lineItems) {
        if (item.serialNumbers && item.serialNumbers.length > 0) {
          for (const sn of item.serialNumbers) {
            // Avoid duplicating the primary machine
            if (sn !== job.serial_number) {
              list.push({ model: item.description || item.itemCode || 'Item', serial: sn })
            }
          }
        }
      }
    }
    return list
  }, [job, parsed])

  const lineItems = parsed?.lineItems ?? []

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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#f59e0b] text-[#0f1117] uppercase tracking-wide">
              Run-Up
            </span>
            {job.po_number && (
              <span className="text-sm font-bold text-[#f1f5f9]">PO {job.po_number}</span>
            )}
            {connote && (
              <>
                <span className="text-[#6b7280]">•</span>
                <span className="text-sm font-mono text-[#94a3b8]">{connote}</span>
              </>
            )}
            {!connote && (
              <>
                <span className="text-[#6b7280]">•</span>
                <span className="text-sm font-mono text-red-300">Connote — Not provided</span>
              </>
            )}
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

        {/* Ship info row */}
        <div className="flex items-center gap-4 text-sm text-[#94a3b8] flex-wrap">
          {parsed?.shipDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#6b7280]" />
              {parsed.shipDate}
            </span>
          )}
          {parsed?.shipFrom && (
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#6b7280]" />
              {parsed.shipFrom}
            </span>
          )}
        </div>

        {/* Machines received */}
        {machines.length > 0 && (
          <div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowMachines(!showMachines) }}
              className="flex items-center gap-2 text-sm text-[#f1f5f9] hover:text-[#f97316] transition"
            >
              <Package className="w-4 h-4 text-[#6b7280]" />
              <span className="font-semibold">Machines: {machines.length}</span>
              {showMachines ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showMachines && (
              <div className="mt-2 space-y-1 pl-6">
                {machines.map((m, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-sm">
                    <span className="font-semibold text-[#f1f5f9]">{m.model}</span>
                    <span className="font-mono text-[#94a3b8]">{m.serial}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Packing list */}
        {lineItems.length > 0 ? (
          <div>
            <div className="flex items-center justify-between">
              <button
                onClick={(e) => { e.stopPropagation(); setShowPackingList(!showPackingList) }}
                className="flex items-center gap-2 text-sm font-semibold text-[#f1f5f9] hover:text-[#f97316] transition"
              >
                <FileText className="w-4 h-4 text-[#6b7280]" />
                View {lineItems.length} item{lineItems.length !== 1 ? 's' : ''}
                {showPackingList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {job.install_pdf_url && (
                <a
                  href={job.install_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 text-xs font-medium text-[#94a3b8] border border-[#2a2d3e] rounded-lg px-2.5 py-1.5 hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition"
                >
                  <ExternalLink className="w-3 h-3" />
                  Open PDF
                </a>
              )}
            </div>
            {showPackingList && (
              <div className="mt-2 space-y-1.5 pl-6">
                {lineItems.map((item, i) => (
                  <div key={i} className="text-sm space-y-0.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {item.itemCode && (
                        <span className="font-mono text-[11px] text-[#6b7280]">{item.itemCode}</span>
                      )}
                      <span className="text-[#94a3b8]">{item.description || '—'}</span>
                      <span className="text-[11px] text-[#6b7280]">
                        {item.orderedQty ?? 0}/{item.shippedQty ?? 0}
                      </span>
                    </div>
                    {item.serialNumbers && item.serialNumbers.length > 0 && (
                      <div className="flex gap-1 flex-wrap pl-4">
                        {item.serialNumbers.map((sn, j) => (
                          <span key={j} className="text-[11px] font-mono text-[#94a3b8] bg-[#2a2d3e] rounded px-1.5 py-0.5">
                            {sn}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          !job.install_pdf_url ? (
            <p className="text-xs text-[#6b7280] italic">No packing list attached</p>
          ) : (
            <a
              href={job.install_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#94a3b8] border border-[#2a2d3e] rounded-lg px-2.5 py-1.5 hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition"
            >
              <ExternalLink className="w-3 h-3" />
              Open PDF
            </a>
          )
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
          type="runup"
          currentStatus={job.status ?? 'new'}
          jobId={job.id}
          onStatusChange={onStatusChange}
        />
        <QuickActionButton
          jobId={job.id}
          currentStatus={job.status ?? 'new'}
          type="runup"
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  )
}
