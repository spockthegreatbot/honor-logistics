'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, CheckCircle2, AlertCircle, Loader2, PenLine, Download, Send } from 'lucide-react'
import { SignaturePad } from '@/components/aod/SignaturePad'
import { StatusBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDate, jobTypeLabel, jobStatusLabel } from '@/lib/utils'

interface RunupDetails {
  id: string
  check_power_on: boolean | null
  check_firmware_loaded: boolean | null
  check_customer_config: boolean | null
  check_serial_verified: boolean | null
  check_test_print: boolean | null
  check_signed_off: boolean | null
  signed_off_by: string | null
  signed_off_at: string | null
}

interface DeliveryDetails {
  id: string
  subtype: string | null
  from_address: string | null
  to_address: string | null
  delivery_notes: string | null
  stair_walker: boolean | null
  parking_available: boolean | null
  parking_notes: string | null
}

interface InstallDetails {
  id: string
  install_type: string | null
  fma_required: boolean | null
  papercut_required: boolean | null
  fma_notes: string | null
  stair_walker: boolean | null
  parking_available: boolean | null
  parking_notes: string | null
}

interface Job {
  id: string
  job_number: string | null
  job_type: string
  status: string | null
  serial_number: string | null
  scheduled_date: string | null
  po_number: string | null
  notes: string | null
  client_id: string | null
  end_customer_id: string | null
  assigned_to: string | null
  client_reference: string | null
  parent_job_id: string | null
  created_at: string | null
  updated_at: string | null
  aod_pdf_url?: string | null
  aod_signed_at?: string | null
  clients?: { name: string } | null
  end_customers?: { name: string; address?: string | null; contact_name?: string | null; contact_phone?: string | null } | null
  staff?: { name: string } | null
  machines?: { model: string | null; make: string | null; machine_type: string | null } | null
  delivery_details?: DeliveryDetails[] | null
  install_details?: InstallDetails[] | null
  runup_details?: RunupDetails | null
}

interface SelectOption { id: string; name: string }

const RUNUP_CHECKS: Array<{ key: keyof RunupDetails; label: string }> = [
  { key: 'check_power_on',         label: 'Power On' },
  { key: 'check_firmware_loaded',  label: 'Firmware Loaded' },
  { key: 'check_customer_config',  label: 'Customer Config' },
  { key: 'check_serial_verified',  label: 'Serial Verified' },
  { key: 'check_test_print',       label: 'Test Print' },
  { key: 'check_signed_off',       label: 'Sign Off' },
]

const STATUS_ORDER: string[] = [
  'new', 'runup_pending', 'runup_complete', 'ready', 'dispatched', 'in_transit', 'complete', 'invoiced'
]

interface Props {
  jobId: string
  onClose: () => void
  onJobUpdated?: (job: Job) => void
}

export function JobSlideOver({ jobId, onClose, onJobUpdated }: Props) {
  const router = useRouter()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checkSaving, setCheckSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [clientReference, setClientReference] = useState('')
  const [clientId, setClientId] = useState('')
  const [endCustomerId, setEndCustomerId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [clients, setClients] = useState<SelectOption[]>([])
  const [endCustomers, setEndCustomers] = useState<SelectOption[]>([])
  const [staffList, setStaffList] = useState<SelectOption[]>([])
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [aodGenerating, setAodGenerating] = useState(false)
  const [aodSending, setAodSending] = useState(false)
  const [aodMessage, setAodMessage] = useState<string | null>(null)

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`)
      if (res.ok) {
        const { job: j } = await res.json()
        setJob(j)
        setNotes(j.notes ?? '')
        setStatus(j.status ?? '')
        setScheduledDate(j.scheduled_date ?? '')
        setPoNumber(j.po_number ?? '')
        setClientReference(j.client_reference ?? '')
        setClientId(j.client_id ?? '')
        setEndCustomerId(j.end_customer_id ?? '')
        setAssignedTo(j.assigned_to ?? '')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    fetchJob()
  }, [fetchJob])

  useEffect(() => {
    fetch('/api/meta')
      .then(r => r.ok ? r.json() : null)
      .then((d: { clients?: SelectOption[]; end_customers?: SelectOption[]; staff?: SelectOption[] } | null) => {
        if (!d) return
        setClients(d.clients ?? [])
        setEndCustomers(d.end_customers ?? [])
        setStaffList(d.staff ?? [])
      })
      .catch(console.error)
  }, [])

  async function handleSave() {
    if (!job) return
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          status,
          scheduled_date: scheduledDate || null,
          po_number: poNumber || null,
          client_reference: clientReference || null,
          client_id: clientId || null,
          end_customer_id: endCustomerId || null,
          assigned_to: assignedTo || null,
        }),
      })
      if (res.ok) {
        const { job: updated } = await res.json()
        setJob(updated)
        onJobUpdated?.(updated)
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleCheckChange(checkKey: keyof RunupDetails, value: boolean) {
    if (!job) return
    setCheckSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/runup`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [checkKey]: value }),
      })
      if (res.ok) {
        await fetchJob()
        onJobUpdated?.(job)
      }
    } finally {
      setCheckSaving(false)
    }
  }

  async function handleSignOff() {
    if (!job) return
    setCheckSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/runup`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_signed_off: true,
          signed_off_at: new Date().toISOString(),
        }),
      })
      if (res.ok) {
        await fetchJob()
      }
    } finally {
      setCheckSaving(false)
    }
  }

  const isRunup = job?.job_type === 'runup'
  const runup = job?.runup_details
  const allChecksComplete = runup
    ? !!(
        runup.check_power_on &&
        runup.check_firmware_loaded &&
        runup.check_customer_config &&
        runup.check_serial_verified &&
        runup.check_test_print
      )
    : false

  const canDispatch = !isRunup || (runup?.check_signed_off ?? false)
  const currentStatusIdx = STATUS_ORDER.indexOf(status)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#1a1d27] border-l border-[#2a2d3e] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2d3e] shrink-0">
          <div className="flex items-center gap-3">
            {job && (
              <>
                <span className="font-mono font-bold text-orange-400 text-lg">
                  #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
                </span>
                <StatusBadge status={job.status ?? ''} />
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#2a2d3e] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 text-[#94a3b8] animate-spin" />
            </div>
          ) : !job ? (
            <div className="p-6 text-center text-[#94a3b8]">Job not found</div>
          ) : (
            <div className="p-5 space-y-6">
              {/* Job Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Type</p>
                  <p className="text-sm font-medium text-[#f1f5f9]">{jobTypeLabel(job.job_type)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Scheduled Date</p>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    className="w-full h-8 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-2 focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Client</p>
                  <select
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    className="w-full h-8 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">— None —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">End Customer</p>
                  <select
                    value={endCustomerId}
                    onChange={e => setEndCustomerId(e.target.value)}
                    className="w-full h-8 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">— None —</option>
                    {endCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Serial</p>
                  <p className="text-sm font-mono text-[#f1f5f9] py-1">{job.serial_number ?? '—'}</p>
                </div>
                {job.machines?.model && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Machine</p>
                    <p className="text-sm text-[#f1f5f9] py-1">{job.machines.model}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">PO #</p>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={e => setPoNumber(e.target.value)}
                    placeholder="—"
                    className="w-full h-8 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Client Ref</p>
                  <input
                    type="text"
                    value={clientReference}
                    onChange={e => setClientReference(e.target.value)}
                    placeholder="—"
                    className="w-full h-8 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Assigned To</p>
                  <select
                    value={assignedTo}
                    onChange={e => setAssignedTo(e.target.value)}
                    className="w-full h-8 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">— Unassigned —</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Contact info from end customer */}
              {(job.end_customers?.contact_name || job.end_customers?.contact_phone || job.end_customers?.address) && (
                <div className="rounded-xl bg-[#1e2130] border border-[#2a2d3e] p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">Site Contact</p>
                  {job.end_customers?.contact_name && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#94a3b8] w-16 shrink-0">Name</span>
                      <span className="text-sm text-[#f1f5f9]">{job.end_customers.contact_name}</span>
                    </div>
                  )}
                  {job.end_customers?.contact_phone && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#94a3b8] w-16 shrink-0">Phone</span>
                      <a href={`tel:${job.end_customers.contact_phone}`} className="text-sm text-orange-400 hover:text-orange-300 transition">
                        {job.end_customers.contact_phone}
                      </a>
                    </div>
                  )}
                  {job.end_customers?.address && (
                    <div className="flex items-start gap-3">
                      <span className="text-xs text-[#94a3b8] w-16 shrink-0 mt-0.5">Address</span>
                      <span className="text-sm text-[#f1f5f9]">{job.end_customers.address}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Delivery / Relocation addresses + site requirements */}
              {job.delivery_details && job.delivery_details.length > 0 && (
                <div className="rounded-xl bg-[#1e2130] border border-[#2a2d3e] p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">
                    {job.delivery_details[0].subtype === 'relocation' ? 'Relocation Details' : 'Delivery Details'}
                  </p>
                  {job.delivery_details[0].from_address && (
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-medium text-red-400 w-10 shrink-0 mt-0.5">FROM</span>
                      <span className="text-sm text-[#f1f5f9]">{job.delivery_details[0].from_address}</span>
                    </div>
                  )}
                  {job.delivery_details[0].to_address && (
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-medium text-green-400 w-10 shrink-0 mt-0.5">TO</span>
                      <span className="text-sm text-[#f1f5f9]">{job.delivery_details[0].to_address}</span>
                    </div>
                  )}
                  {/* Always show stair walker + parking */}
                  <div className="flex gap-4 pt-1 border-t border-[#2a2d3e]">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${job.delivery_details[0].stair_walker ? 'bg-amber-400' : 'bg-[#2a2d3e]'}`} />
                      <span className={`text-xs ${job.delivery_details[0].stair_walker ? 'text-amber-300 font-medium' : 'text-[#94a3b8]'}`}>
                        Stair Walker: {job.delivery_details[0].stair_walker ? 'YES ⚠️' : 'No'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${job.delivery_details[0].parking_available ? 'bg-green-400' : 'bg-[#2a2d3e]'}`} />
                      <span className={`text-xs ${job.delivery_details[0].parking_available ? 'text-green-300' : 'text-[#94a3b8]'}`}>
                        Parking: {job.delivery_details[0].parking_available ? 'Yes' : 'No / Unknown'}
                      </span>
                    </div>
                  </div>
                  {job.delivery_details[0].parking_notes && (
                    <p className="text-xs text-[#94a3b8] italic">{job.delivery_details[0].parking_notes}</p>
                  )}
                </div>
              )}

              {/* Install details */}
              {job.install_details && job.install_details.length > 0 && (
                <div className="rounded-xl bg-[#1e2130] border border-[#2a2d3e] p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">Install Details</p>
                  <div className="flex flex-wrap gap-2">
                    {job.install_details[0].install_type && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[#2a2d3e] text-[#f1f5f9]">
                        {job.install_details[0].install_type}
                      </span>
                    )}
                    {job.install_details[0].fma_required && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 font-medium">
                        ⚠️ FMA Required
                      </span>
                    )}
                    {job.install_details[0].papercut_required && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-300 font-medium">
                        PaperCut Required
                      </span>
                    )}
                  </div>
                  {/* Always show stair walker + parking */}
                  <div className="flex gap-4 pt-1 border-t border-[#2a2d3e]">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${job.install_details[0].stair_walker ? 'bg-amber-400' : 'bg-[#2a2d3e]'}`} />
                      <span className={`text-xs ${job.install_details[0].stair_walker ? 'text-amber-300 font-medium' : 'text-[#94a3b8]'}`}>
                        Stair Walker: {job.install_details[0].stair_walker ? 'YES ⚠️' : 'No'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${job.install_details[0].parking_available ? 'bg-green-400' : 'bg-[#2a2d3e]'}`} />
                      <span className={`text-xs ${job.install_details[0].parking_available ? 'text-green-300' : 'text-[#94a3b8]'}`}>
                        Parking: {job.install_details[0].parking_available ? 'Yes' : 'No / Unknown'}
                      </span>
                    </div>
                  </div>
                  {job.install_details[0].parking_notes && (
                    <p className="text-xs text-[#94a3b8] italic">{job.install_details[0].parking_notes}</p>
                  )}
                  {job.install_details[0].fma_notes && (
                    <p className="text-xs text-[#94a3b8]">{job.install_details[0].fma_notes}</p>
                  )}
                </div>
              )}

              {/* Parent Job link */}
              {job.parent_job_id && (
                <div className="rounded-lg bg-[#1e2130] border border-[#2a2d3e] px-4 py-2.5 flex items-center gap-2">
                  <span className="text-xs text-[#94a3b8]">Bundle:</span>
                  <button
                    onClick={() => { onClose(); setTimeout(() => onJobUpdated?.({ ...job }), 100) }}
                    className="text-xs font-mono font-medium text-orange-400 hover:text-orange-300 transition"
                  >
                    Parent Job
                  </button>
                </div>
              )}

              {/* Status update */}
              <div>
                <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-2">Update Status</p>
                <div className="relative">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s} disabled={
                        s === 'dispatched' && !canDispatch
                      }>
                        {jobStatusLabel(s)}{s === 'dispatched' && !canDispatch ? ' (run-up required)' : ''}
                      </option>
                    ))}
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                {status === 'dispatched' && !canDispatch && (
                  <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Run-up must be signed off before dispatching
                  </p>
                )}
              </div>

              {/* Status Timeline */}
              <div>
                <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-3">Status Timeline</p>
                <div className="space-y-2">
                  {STATUS_ORDER.map((s, idx) => {
                    const done = idx <= currentStatusIdx
                    const current = idx === currentStatusIdx
                    return (
                      <div key={s} className={`flex items-center gap-3 text-xs ${done ? 'text-[#f1f5f9]' : 'text-[#94a3b8]/40'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${current ? 'bg-orange-500 ring-2 ring-orange-500/30' : done ? 'bg-green-400' : 'bg-[#2a2d3e]'}`} />
                        <span className={current ? 'font-semibold text-orange-400' : ''}>
                          {jobStatusLabel(s)}
                        </span>
                        {current && <span className="text-[#94a3b8]">← current</span>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Run-Up Checklist */}
              {isRunup && (
                <div className="border border-[#2a2d3e] rounded-xl p-4 bg-[#1e2130]">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-[#f1f5f9]">Run-Up Checklist</p>
                    {checkSaving && <Loader2 className="w-4 h-4 animate-spin text-[#94a3b8]" />}
                  </div>
                  <div className="space-y-3">
                    {RUNUP_CHECKS.map(({ key, label }) => {
                      const isSignOff = key === 'check_signed_off'
                      const checked = !!(runup?.[key])
                      if (isSignOff) return null // handled by button below
                      return (
                        <label key={key} className="flex items-center gap-3 cursor-pointer group">
                          <div
                            onClick={() => handleCheckChange(key, !checked)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition cursor-pointer ${
                              checked
                                ? 'bg-green-500 border-green-500'
                                : 'border-[#2a2d3e] group-hover:border-[#94a3b8]'
                            }`}
                          >
                            {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          <span className={`text-sm ${checked ? 'text-green-400 line-through' : 'text-[#f1f5f9]'}`}>
                            {label}
                          </span>
                        </label>
                      )
                    })}
                  </div>

                  {runup?.check_signed_off ? (
                    <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      <span className="text-sm text-green-400 font-medium">
                        Signed off {runup.signed_off_at ? `on ${formatDate(runup.signed_off_at)}` : ''}
                      </span>
                    </div>
                  ) : (
                    <Button
                      onClick={handleSignOff}
                      disabled={!allChecksComplete || checkSaving}
                      className="w-full mt-4"
                      size="sm"
                    >
                      {checkSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Sign Off &amp; Mark Ready
                    </Button>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-2">Notes</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Add notes…"
                  className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] placeholder:text-[#94a3b8]/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>

              {/* AOD Section */}
              <div className="border border-[#2a2d3e] rounded-xl p-4 bg-[#1e2130]">
                <p className="text-sm font-semibold text-[#f1f5f9] mb-3">Acknowledgment of Delivery (AOD)</p>

                {job?.aod_signed_at ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      <div>
                        <p className="text-sm text-green-400 font-medium">AOD Signed</p>
                        <p className="text-xs text-[#94a3b8]">{new Date(job.aod_signed_at).toLocaleString('en-AU')}</p>
                      </div>
                    </div>
                    {aodMessage && (
                      <p className="text-xs text-green-400">{aodMessage}</p>
                    )}
                    <div className="flex items-center gap-2">
                      {job.aod_pdf_url && (
                        <a
                          href={job.aod_pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1"
                        >
                          <Button variant="outline" size="sm" className="w-full flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            Download PDF
                          </Button>
                        </a>
                      )}
                      <Button
                        size="sm"
                        onClick={async () => {
                          setAodSending(true)
                          setAodMessage(null)
                          try {
                            const res = await fetch(`/api/jobs/${job.id}/aod/send`, { method: 'POST' })
                            if (res.ok) {
                              setAodMessage('✅ AOD emailed to Onur successfully')
                            } else {
                              const d = await res.json() as { error?: string }
                              setAodMessage(`❌ ${d.error ?? 'Send failed'}`)
                            }
                          } catch {
                            setAodMessage('❌ Network error')
                          } finally {
                            setAodSending(false)
                          }
                        }}
                        disabled={aodSending}
                        className="flex-1 flex items-center gap-2"
                      >
                        {aodSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {aodSending ? 'Sending…' : 'Send to Email'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-[#94a3b8]">
                      Get the customer to sign on-screen to generate a PDF acknowledgment of delivery.
                    </p>
                    {aodMessage && (
                      <p className="text-xs text-red-400">{aodMessage}</p>
                    )}
                    <Button
                      onClick={() => setShowSignaturePad(true)}
                      disabled={aodGenerating}
                      className="w-full flex items-center gap-2"
                      size="sm"
                    >
                      {aodGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
                      {aodGenerating ? 'Generating AOD…' : 'Get Customer Signature'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Signature Pad Overlay */}
        {job && (
          <SignaturePad
            isOpen={showSignaturePad}
            onClose={() => setShowSignaturePad(false)}
            jobNumber={job.job_number}
            onConfirm={async (signatureDataUrl) => {
              setShowSignaturePad(false)
              setAodGenerating(true)
              setAodMessage(null)
              try {
                const res = await fetch(`/api/jobs/${job.id}/aod/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ signatureDataUrl }),
                })
                if (res.ok) {
                  // Refresh job to get aod_pdf_url + aod_signed_at
                  const refresh = await fetch(`/api/jobs/${job.id}`)
                  if (refresh.ok) {
                    const { job: updated } = await refresh.json() as { job: Job }
                    setJob(updated)
                    if (onJobUpdated) onJobUpdated(updated)
                  }
                } else {
                  const d = await res.json() as { error?: string }
                  setAodMessage(`❌ ${d.error ?? 'Generation failed'}`)
                }
              } catch {
                setAodMessage('❌ Network error generating AOD')
              } finally {
                setAodGenerating(false)
              }
            }}
          />
        )}

        {/* Footer */}
        {!loading && job && (
          <div className="px-5 py-4 border-t border-[#2a2d3e] flex items-center justify-between gap-3 shrink-0">
            <p className="text-xs text-[#94a3b8]">
              Created {formatDate(job.created_at)}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save changes'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
