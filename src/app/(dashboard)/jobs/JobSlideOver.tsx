'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Clock, CheckCircle2, AlertCircle, ChevronRight, Loader2 } from 'lucide-react'
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

interface Job {
  id: string
  job_number: string | null
  job_type: string
  status: string | null
  serial_number: string | null
  scheduled_date: string | null
  po_number: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  clients?: { name: string } | null
  end_customers?: { name: string } | null
  staff?: { name: string } | null
  runup_details?: RunupDetails | null
}

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
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checkSaving, setCheckSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('')

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`)
      if (res.ok) {
        const { job: j } = await res.json()
        setJob(j)
        setNotes(j.notes ?? '')
        setStatus(j.status ?? '')
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

  async function handleSave() {
    if (!job) return
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, status }),
      })
      if (res.ok) {
        const { job: updated } = await res.json()
        setJob(updated)
        onJobUpdated?.(updated)
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
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Scheduled</p>
                  <p className="text-sm font-medium text-[#f1f5f9]">{formatDate(job.scheduled_date)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Client</p>
                  <p className="text-sm font-medium text-[#f1f5f9]">{job.clients?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Customer</p>
                  <p className="text-sm font-medium text-[#f1f5f9]">{job.end_customers?.name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Serial</p>
                  <p className="text-sm font-mono text-[#f1f5f9]">{job.serial_number ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">PO #</p>
                  <p className="text-sm font-medium text-[#f1f5f9]">{job.po_number ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Assigned To</p>
                  <p className="text-sm font-medium text-[#f1f5f9]">{job.staff?.name ?? '—'}</p>
                </div>
              </div>

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
            </div>
          )}
        </div>

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
