'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, CheckCircle2, AlertCircle, Loader2, PenLine, Download, Send, Printer, FileText } from 'lucide-react'
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
  signed_aod_url?: string | null
  signed_aod_at?: string | null
  // EFEX order fields
  order_types?: string[] | null
  contact_name?: string | null
  contact_phone?: string | null
  scheduled_time?: string | null
  machine_accessories?: string | null
  install_idca?: boolean | null
  address_to?: string | null
  address_from?: string | null
  stair_walker?: boolean | null
  stair_walker_comment?: string | null
  parking?: boolean | null
  parking_comment?: string | null
  pickup_model?: string | null
  pickup_accessories?: string | null
  pickup_serial?: string | null
  pickup_disposition?: string | null
  special_instructions?: string | null
  has_aod?: boolean | null
  machine_model?: string | null
  booking_form_url?: string | null
  install_pdf_url?: string | null
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
  // EFEX fields
  const [orderTypes, setOrderTypes] = useState<string[]>([])
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [machineAccessories, setMachineAccessories] = useState('')
  const [installIdca, setInstallIdca] = useState<boolean | null>(null)
  const [addressTo, setAddressTo] = useState('')
  const [addressFrom, setAddressFrom] = useState('')
  const [stairWalker, setStairWalker] = useState<boolean | null>(null)
  const [stairWalkerComment, setStairWalkerComment] = useState('')
  const [parkingYn, setParkingYn] = useState<boolean | null>(null)
  const [parkingComment, setParkingComment] = useState('')
  const [pickupModel, setPickupModel] = useState('')
  const [pickupAccessories, setPickupAccessories] = useState('')
  const [pickupSerial, setPickupSerial] = useState('')
  const [pickupDisposition, setPickupDisposition] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [machineModel, setMachineModel] = useState('')
  const [hasAod, setHasAod] = useState(false)

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`)
      if (res.ok) {
        const { job: j } = await res.json()
        setJob(j)
        setNotes(j.notes ?? '')
        setStatus(j.status ?? '')
        setScheduledDate(j.scheduled_date ?? '')
        setClientId(j.client_id ?? '')
        setEndCustomerId(j.end_customer_id ?? '')
        setAssignedTo(j.assigned_to ?? '')
        // EFEX fields — fall back to job_type when order_types not yet set
        const EFEX_TYPES = ['delivery', 'installation', 'pickup', 'relocation']
        const loadedOrderTypes = (j.order_types && j.order_types.length > 0)
          ? j.order_types
          : (EFEX_TYPES.includes(j.job_type) ? [j.job_type] : [])
        setOrderTypes(loadedOrderTypes)
        setContactName(j.contact_name ?? '')
        setContactPhone(j.contact_phone ?? '')
        setScheduledTime(j.scheduled_time ?? '')
        setMachineAccessories(j.machine_accessories ?? '')
        setInstallIdca(j.install_idca ?? null)
        setAddressTo(j.address_to ?? '')
        setAddressFrom(j.address_from ?? '')
        setStairWalker(j.stair_walker ?? null)
        setStairWalkerComment(j.stair_walker_comment ?? '')
        setParkingYn(j.parking ?? null)
        setParkingComment(j.parking_comment ?? '')
        setPickupModel(j.pickup_model ?? '')
        setPickupAccessories(j.pickup_accessories ?? '')
        setPickupSerial(j.pickup_serial ?? '')
        setPickupDisposition(j.pickup_disposition ?? '')
        setSpecialInstructions(j.special_instructions ?? '')
        setSerialNumber(j.serial_number ?? '')
        setMachineModel(j.machine_model ?? '')
        setHasAod(j.has_aod ?? false)
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
          client_id: clientId || null,
          end_customer_id: endCustomerId || null,
          assigned_to: assignedTo || null,
          serial_number: serialNumber || null,
          // EFEX fields
          order_types: orderTypes,
          contact_name: contactName || null,
          contact_phone: contactPhone || null,
          scheduled_time: scheduledTime || null,
          machine_model: machineModel || null,
          machine_accessories: machineAccessories || null,
          install_idca: installIdca,
          address_to: addressTo || null,
          address_from: addressFrom || null,
          stair_walker: stairWalker,
          stair_walker_comment: stairWalkerComment || null,
          parking: parkingYn,
          parking_comment: parkingComment || null,
          pickup_model: pickupModel || null,
          pickup_accessories: pickupAccessories || null,
          pickup_serial: pickupSerial || null,
          pickup_disposition: pickupDisposition || null,
          special_instructions: specialInstructions || null,
          has_aod: hasAod,
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
          <div className="flex items-center gap-2 flex-wrap">
            {job && (
              <>
                <span className="font-mono font-bold text-orange-400 text-lg">
                  #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
                </span>
                <StatusBadge status={job.status ?? ''} />
                {(job.order_types ?? []).map((t: string) => {
                  const map: Record<string, string> = { delivery: '🚚 Delivery', installation: '🔧 Installation', pickup: '📦 Pick-Up', relocation: '🔄 Relocation' }
                  return (
                    <span key={t} className="bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 rounded-full text-xs font-semibold">
                      {map[t] ?? t}
                    </span>
                  )
                })}
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
              {(() => {
                const isAxus = (job.clients?.name ?? '').toLowerCase().includes('axus')
                const inputCls = 'w-full h-8 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-2 focus:outline-none focus:ring-2 focus:ring-orange-500'
                const labelCls = 'text-xs uppercase tracking-wider text-[#94a3b8] mb-1 block'

                // Parse Axus notes
                const notesLines = job.notes?.split('\n') ?? []
                const faultLine = notesLines.find(l => l.trim() && !l.startsWith('Items:') && !l.startsWith('EDI Label:'))?.trim()
                const itemsLine = notesLines.find(l => l.startsWith('Items:'))?.replace('Items:', '').trim()

                if (isAxus) {
                  return (
                    <>
                      {/* Axus: Job Details */}
                      <div className="rounded-xl bg-[#1e2130] border border-[#2a2d3e] p-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Job Details</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className={labelCls}>Job #</p>
                            <p className="text-sm font-mono font-bold text-orange-400">{job.job_number ?? '—'}</p>
                          </div>
                          <div>
                            <p className={labelCls}>Due Date</p>
                            <input
                              type="date"
                              value={scheduledDate}
                              onChange={e => setScheduledDate(e.target.value)}
                              className={inputCls + ' [color-scheme:dark]'}
                            />
                          </div>
                          <div className="col-span-2">
                            <p className={labelCls}>Ship To / Customer</p>
                            <p className="text-sm text-[#f1f5f9]">{job.end_customers?.name ?? '—'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className={labelCls}>Delivery Address</p>
                            <input value={addressTo} onChange={e => setAddressTo(e.target.value)} placeholder="—" className={inputCls} />
                          </div>
                          <div>
                            <p className={labelCls}>Contact</p>
                            <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="—" className={inputCls} />
                          </div>
                          <div>
                            <p className={labelCls}>Phone</p>
                            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="—" className={inputCls} />
                          </div>
                        </div>
                      </div>

                      {/* Axus: Machine */}
                      <div className="rounded-xl bg-[#1e2130] border border-[#2a2d3e] p-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Machine</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className={labelCls}>Model</p>
                            <input value={machineModel} onChange={e => setMachineModel(e.target.value)} placeholder="—" className={inputCls} />
                          </div>
                          <div>
                            <p className={labelCls}>Serial #</p>
                            <input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="—" className={inputCls} />
                          </div>
                        </div>
                      </div>

                      {/* Axus: Line Items */}
                      {itemsLine && (
                        <div className="rounded-xl bg-[#1e2130] border border-[#2a2d3e] p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-[#94a3b8] mb-2">Line Items</p>
                          <p className="text-sm text-[#f1f5f9]">{itemsLine}</p>
                        </div>
                      )}

                      {/* Axus: Fault */}
                      {faultLine && (
                        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">Fault</p>
                          <p className="text-sm text-amber-200">{faultLine}</p>
                        </div>
                      )}
                    </>
                  )
                }

                // EFEX layout
                const orderTypesList = orderTypes
                const hasDel = orderTypesList.includes('delivery') || orderTypesList.includes('installation')
                const hasRel = orderTypesList.includes('relocation')
                const hasPick = orderTypesList.includes('pickup')
                const needsAddr = hasDel || hasRel

                const YNBtn = ({ val, cur, onSet, color }: { val: boolean; cur: boolean | null; onSet: (v: boolean | null) => void; color: 'green' | 'red' }) => (
                  <button type="button" onClick={() => onSet(cur === val ? null : val)}
                    className={`px-3 py-1 rounded-lg border text-xs font-bold transition ${cur === val
                      ? color === 'green' ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-red-500/20 border-red-500/40 text-red-400'
                      : 'border-[#2a2d3e] text-[#94a3b8] hover:border-[#4a4d5e]'
                    }`}>{val ? 'YES' : 'NO'}</button>
                )

                return (
                  <>
                    {/* EFEX: Job Info grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Job #</p>
                        <p className="text-sm font-mono font-bold text-orange-400">{job.job_number ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Type</p>
                        <p className="text-sm font-medium text-[#f1f5f9]">
                          {(job.order_types && job.order_types.length > 0)
                            ? job.order_types.map(t => ({delivery:'Delivery',installation:'Installation',pickup:'Pick-Up',relocation:'Relocation'}[t]??t)).join(' + ')
                            : jobTypeLabel(job.job_type)
                          }
                        </p>
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
                      {(job.end_customers?.name ?? job.notes?.match(/Customer: ([^\n]+)/)?.[1]?.trim()) && (
                        <div>
                          <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Customer</p>
                          <p className="text-sm text-[#f1f5f9] py-1">{job.end_customers?.name ?? job.notes?.match(/Customer: ([^\n]+)/)?.[1]?.trim()}</p>
                        </div>
                      )}
                    </div>

                    {/* EFEX: Contact & Schedule */}
                    <div className="rounded-xl bg-[#1e2130] border border-[#2a2d3e] p-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Contact &amp; Schedule</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelCls}>Contact Name</label>
                          <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="—" className={inputCls} />
                        </div>
                        <div><label className={labelCls}>Contact Phone</label>
                          <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="—" className={inputCls} />
                        </div>
                      </div>
                      <div><label className={labelCls}>Time</label>
                        <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className={inputCls} />
                      </div>
                    </div>

                    {/* EFEX: Machine Details */}
                    <div className="rounded-xl bg-[#1e2130] border border-[#2a2d3e] p-4 space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Machine Details</p>
                      <div>
                        <label className={labelCls}>Model / Part #</label>
                        <input value={machineModel} onChange={e => setMachineModel(e.target.value)} placeholder="—" className={inputCls} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelCls}>Accessories / Part #</label>
                          <input value={machineAccessories} onChange={e => setMachineAccessories(e.target.value)} placeholder="—" className={inputCls} />
                        </div>
                        <div><label className={labelCls}>Serial #</label>
                          <input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="—" className={inputCls} />
                        </div>
                      </div>
                      {hasDel && (
                        <div>
                          <label className={labelCls}>Install IDCA</label>
                          <div className="flex items-center gap-2">
                            <YNBtn val={true} cur={installIdca} onSet={setInstallIdca} color="green" />
                            <YNBtn val={false} cur={installIdca} onSet={setInstallIdca} color="red" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* EFEX: Address */}
                    {needsAddr && (
                      <div className="rounded-xl bg-[#1e2130] border border-[#2a2d3e] p-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">
                          {hasRel ? 'Relocation Addresses' : 'Delivery Address'}
                        </p>
                        {hasRel && (
                          <div><label className={labelCls}>Address FROM</label>
                            <input value={addressFrom} onChange={e => setAddressFrom(e.target.value)} placeholder="Collection address" className={inputCls} />
                          </div>
                        )}
                        <div><label className={labelCls}>{hasRel ? 'Address TO' : 'Delivery Address'}</label>
                          <input value={addressTo} onChange={e => setAddressTo(e.target.value)} placeholder="Delivery address" className={inputCls} />
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className={labelCls}>Stair Walker</label>
                            <div className="flex items-center gap-2">
                              <YNBtn val={true} cur={stairWalker} onSet={setStairWalker} color="green" />
                              <YNBtn val={false} cur={stairWalker} onSet={setStairWalker} color="red" />
                              <input value={stairWalkerComment} onChange={e => setStairWalkerComment(e.target.value)} placeholder="Comment…" className={`${inputCls} flex-1`} />
                            </div>
                          </div>
                          <div>
                            <label className={labelCls}>Parking</label>
                            <div className="flex items-center gap-2">
                              <YNBtn val={true} cur={parkingYn} onSet={setParkingYn} color="green" />
                              <YNBtn val={false} cur={parkingYn} onSet={setParkingYn} color="red" />
                              <input value={parkingComment} onChange={e => setParkingComment(e.target.value)} placeholder="Parking notes…" className={`${inputCls} flex-1`} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* EFEX: Pick-Up */}
                    {hasPick && (
                      <div className="rounded-xl bg-[#1e2130] border border-[#2a2d3e] p-4 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Pick-Up Details</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className={labelCls}>Pick-Up Model</label>
                            <input value={pickupModel} onChange={e => setPickupModel(e.target.value)} placeholder="—" className={inputCls} />
                          </div>
                          <div><label className={labelCls}>Pick-Up Serial</label>
                            <input value={pickupSerial} onChange={e => setPickupSerial(e.target.value)} placeholder="—" className={inputCls} />
                          </div>
                        </div>
                        <div><label className={labelCls}>Pick-Up Accessories</label>
                          <input value={pickupAccessories} onChange={e => setPickupAccessories(e.target.value)} placeholder="—" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Disposition</label>
                          <div className="flex flex-wrap gap-2">
                            {['Recycle', 'Refurb', 'Loan', 'Scrap'].map(d => (
                              <button key={d} type="button" onClick={() => setPickupDisposition(p => p === d ? '' : d)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                                  pickupDisposition === d ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'border-[#2a2d3e] text-[#94a3b8] hover:border-[#4a4d5e]'
                                }`}>{d}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* EFEX: Special Instructions */}
                    <div>
                      <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-2">Special Instructions</p>
                      <textarea value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)}
                        rows={3} placeholder="e.g. Call 30 mins prior, loading dock at rear…"
                        className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] placeholder:text-[#94a3b8]/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
                    </div>
                  </>
                )
              })()}

              {/* Common: Assigned Driver */}
              <div>
                <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-1">Assigned Driver</p>
                <select
                  value={assignedTo}
                  onChange={e => setAssignedTo(e.target.value)}
                  className="w-full h-8 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">— Unassigned —</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Common: Status */}
              <div>
                <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-2">Update Status</p>
                <div className="relative">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full h-9 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s} disabled={s === 'dispatched' && !canDispatch}>
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

              {/* Common: Run-Up Checklist */}
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
                      if (isSignOff) return null
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

              {/* Common: Internal Notes */}
              <div>
                <p className="text-xs uppercase tracking-wider text-[#94a3b8] mb-2">Internal Notes</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Internal notes (not printed)…"
                  className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] placeholder:text-[#94a3b8]/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
              </div>

              {/* Common: AOD Section */}
              <div className="border border-[#2a2d3e] rounded-xl p-4 bg-[#1e2130] space-y-5">
                <p className="text-sm font-semibold text-[#f1f5f9]">AOD Documents</p>

                {/* Sub-section A: Customer Signature */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">Customer Signature</p>
                  {!job?.signed_aod_url ? (
                    <div className="space-y-2">
                      <Button
                        className="w-full flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                        size="sm"
                        disabled={aodGenerating}
                        onClick={() => { setAodMessage(null); setShowSignaturePad(true) }}
                      >
                        {aodGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
                        {aodGenerating ? 'Generating…' : 'Get Customer Signature'}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                        <div>
                          <p className="text-sm text-green-400 font-medium">Signed ✅</p>
                          {job.signed_aod_at && (
                            <p className="text-xs text-[#94a3b8]">{new Date(job.signed_aod_at).toLocaleString('en-AU')}</p>
                          )}
                        </div>
                      </div>
                      <a href={job.signed_aod_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm" className="w-full flex items-center gap-2">
                          <Download className="w-4 h-4" />Download Signed AOD
                        </Button>
                      </a>
                    </div>
                  )}
                </div>

                {/* Sub-section B: EFEX AOD */}
                <div className="space-y-2 pt-3 border-t border-[#2a2d3e]">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#94a3b8]">EFEX AOD</p>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={hasAod} onChange={e => setHasAod(e.target.checked)} className="w-4 h-4 accent-orange-500" />
                    <span className="text-sm text-[#f1f5f9]">EFEX has sent AOD</span>
                  </label>
                  {job?.aod_pdf_url ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                        <FileText className="w-4 h-4 text-green-400 shrink-0" />
                        <p className="text-sm text-green-400 font-medium">EFEX AOD received ✅</p>
                      </div>
                      <div className="flex gap-2">
                        <a href={job.aod_pdf_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                          <Button variant="outline" size="sm" className="w-full flex items-center gap-2">
                            <Download className="w-4 h-4" />Download
                          </Button>
                        </a>
                        <a href={job.aod_pdf_url} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => window.print(), 500)} className="flex-1">
                          <Button size="sm" className="w-full flex items-center gap-2">
                            <Printer className="w-4 h-4" />Print
                          </Button>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#94a3b8] italic">Will auto-attach when EFEX emails it</p>
                  )}
                </div>

                {/* Send to Onur */}
                <div className="pt-3 border-t border-[#2a2d3e] space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full flex items-center gap-2"
                    disabled={aodSending || (!job?.signed_aod_url && !job?.aod_pdf_url)}
                    onClick={async () => {
                      setAodSending(true)
                      setAodMessage(null)
                      try {
                        const res = await fetch(`/api/jobs/${job.id}/aod/send`, { method: 'POST' })
                        if (res.ok) {
                          setAodMessage('✅ AOD sent to info@honorremovals.com.au')
                        } else {
                          const d = await res.json() as { error?: string }
                          setAodMessage(`❌ ${d.error ?? 'Send failed'}`)
                        }
                      } catch {
                        setAodMessage('❌ Network error sending AOD')
                      } finally {
                        setAodSending(false)
                      }
                    }}
                  >
                    {aodSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {aodSending ? 'Sending…' : 'Send to Onur'}
                  </Button>
                  {aodMessage && (
                    <p className="text-xs text-[#94a3b8]">{aodMessage}</p>
                  )}
                </div>
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
                  // Refresh job to get signed_aod_url + signed_aod_at
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
            <a href={`/jobs/${job.id}/print`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Printer className="w-4 h-4" />
                Print Card
              </Button>
            </a>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
