'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Client { id: string; name: string }
interface EndCustomer { id: string; name: string; client_id: string | null }
interface Staff { id: string; name: string }

interface Props {
  onClose: () => void
  onCreated?: (job: never) => void
}

const EFEX_ORDER_TYPES = [
  { value: 'delivery',     label: '🚚 Delivery' },
  { value: 'installation', label: '🔧 Installation' },
  { value: 'pickup',       label: '📦 Pick-Up' },
  { value: 'relocation',   label: '🔄 Relocation' },
]

const INTERNAL_JOB_TYPES = [
  { value: 'runup',      label: 'Run-Up' },
  { value: 'inwards',    label: 'Inwards' },
  { value: 'outwards',   label: 'Outwards' },
  { value: 'toner_ship', label: 'Toner Ship' },
  { value: 'storage',    label: 'Storage' },
  { value: 'warehouse',  label: 'Warehouse' },
]

const PICKUP_DISPOSITIONS = ['Recycle', 'Refurb', 'Loan', 'Scrap']

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wider text-[#94a3b8] mb-1.5">
      {children}{required && <span className="text-red-400 ml-1">*</span>}
    </label>
  )
}

function Field({ children, half }: { children: React.ReactNode; half?: boolean }) {
  return <div className={half ? 'flex-1 min-w-0' : 'w-full'}>{children}</div>
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="h-px flex-1 bg-[#2a2d3e]" />
      <span className="text-xs font-bold uppercase tracking-widest text-[#94a3b8]">{title}</span>
      <div className="h-px flex-1 bg-[#2a2d3e]" />
    </div>
  )
}

function YesNoField({
  label, value, comment, commentPlaceholder, onChange, onCommentChange,
}: {
  label: string
  value: boolean | null
  comment: string
  commentPlaceholder?: string
  onChange: (v: boolean | null) => void
  onCommentChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        {(['yes', 'no'] as const).map((opt) => {
          const boolVal = opt === 'yes'
          const active = value === boolVal
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(active ? null : boolVal)}
              className={`px-4 py-2 rounded-lg border text-sm font-semibold transition ${
                active
                  ? opt === 'yes'
                    ? 'bg-green-500/20 border-green-500/40 text-green-400'
                    : 'bg-red-500/20 border-red-500/40 text-red-400'
                  : 'border-[#2a2d3e] text-[#94a3b8] hover:border-[#4a4d5e]'
              }`}
            >
              {opt === 'yes' ? 'YES' : 'NO'}
            </button>
          )
        })}
        <Input
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder={commentPlaceholder ?? 'Comment…'}
          className="flex-1 h-9 text-sm"
        />
      </div>
    </div>
  )
}

export function NewJobSlideOver({ onClose, onCreated }: Props) {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [endCustomers, setEndCustomers] = useState<EndCustomer[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isEfex, setIsEfex] = useState(true)
  const [showInternal, setShowInternal] = useState(false)

  const [form, setForm] = useState({
    // Core
    client_id: '',
    end_customer_id: '',
    assigned_to: '',
    scheduled_date: '',
    notes: '',
    // EFEX
    order_types: [] as string[],
    client_reference: '',   // EFEX Reference
    contact_name: '',
    contact_phone: '',
    scheduled_time: '',
    has_aod: false,
    // Machine
    machine_serial: '',
    machine_model: '',
    machine_accessories: '',
    install_idca: null as boolean | null,
    // Addresses
    address_to: '',
    address_from: '',
    stair_walker: null as boolean | null,
    stair_walker_comment: '',
    parking: null as boolean | null,
    parking_comment: '',
    // Pick-Up
    pickup_model: '',
    pickup_accessories: '',
    pickup_serial: '',
    pickup_disposition: '',
    // Special
    special_instructions: '',
    // Internal
    internal_job_type: 'runup',
  })

  const set = (k: keyof typeof form, v: unknown) => setForm(p => ({ ...p, [k]: v }))

  const toggleOrderType = (type: string) => {
    setForm(p => ({
      ...p,
      order_types: p.order_types.includes(type)
        ? p.order_types.filter(t => t !== type)
        : [...p.order_types, type],
    }))
  }

  const hasType = (type: string) => form.order_types.includes(type)
  const hasDeliveryOrInstall = hasType('delivery') || hasType('installation')
  const hasRelocation = hasType('relocation')
  const hasPickup = hasType('pickup')
  const needsAddress = hasDeliveryOrInstall || hasRelocation

  useEffect(() => {
    async function loadMeta() {
      try {
        const [clientsRes, staffRes] = await Promise.all([
          fetch('/api/meta/clients'),
          fetch('/api/meta/staff'),
        ])
        if (clientsRes.ok) setClients(await clientsRes.json())
        if (staffRes.ok) setStaff(await staffRes.json())
        if (!clientsRes.ok || !staffRes.ok) setError('Failed to load form data.')
      } catch {
        setError('Network error loading form data.')
      }
      setLoadingMeta(false)
    }
    loadMeta()
  }, [])

  useEffect(() => {
    async function loadCustomers() {
      if (!form.client_id) { setEndCustomers([]); return }
      try {
        const res = await fetch(`/api/meta/end-customers?client_id=${form.client_id}`)
        if (res.ok) setEndCustomers(await res.json())
      } catch {}
    }
    loadCustomers()
  }, [form.client_id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEfex && form.order_types.length === 0) {
      setError('Select at least one order type.')
      return
    }
    if (!form.client_id) {
      setError('Client is required.')
      return
    }

    setSubmitting(true)
    setError(null)

    const payload = isEfex ? {
      job_type: form.order_types[0] ?? 'delivery',
      order_types: form.order_types,
      client_id: form.client_id,
      end_customer_id: form.end_customer_id || null,
      machine_serial: form.machine_serial || null,
      machine_model: form.machine_model || null,
      scheduled_date: form.scheduled_date || null,
      assigned_to: form.assigned_to || null,
      notes: form.notes || null,
      client_reference: form.client_reference || null,
      contact_name: form.contact_name || null,
      contact_phone: form.contact_phone || null,
      scheduled_time: form.scheduled_time || null,
      machine_accessories: form.machine_accessories || null,
      install_idca: form.install_idca,
      address_to: form.address_to || null,
      address_from: form.address_from || null,
      stair_walker: form.stair_walker,
      stair_walker_comment: form.stair_walker_comment || null,
      parking: form.parking,
      parking_comment: form.parking_comment || null,
      pickup_model: form.pickup_model || null,
      pickup_accessories: form.pickup_accessories || null,
      pickup_serial: form.pickup_serial || null,
      pickup_disposition: form.pickup_disposition || null,
      special_instructions: form.special_instructions || null,
      has_aod: form.has_aod,
    } : {
      job_type: form.internal_job_type,
      client_id: form.client_id,
      end_customer_id: form.end_customer_id || null,
      machine_serial: form.machine_serial || null,
      scheduled_date: form.scheduled_date || null,
      assigned_to: form.assigned_to || null,
      notes: form.notes || null,
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        onCreated?.(data.job as never)
        router.refresh()
        onClose()
      } else {
        const d = await res.json().catch(() => ({})) as { error?: string }
        setError(d.error ?? 'Failed to create job.')
      }
    } catch {
      setError('Network error. Try again.')
    }
    setSubmitting(false)
  }

  const selectCls = 'w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500'

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-[#13161f] border-l border-[#2a2d3e] z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2d3e] shrink-0">
          <h2 className="text-lg font-bold text-[#f1f5f9]">New Job</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#2a2d3e]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loadingMeta ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#94a3b8]" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="px-5 py-4 space-y-5">
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">{error}</div>
              )}

              {/* Job kind toggle */}
              <div className="flex items-center gap-2 p-1 rounded-xl bg-[#1e2130] border border-[#2a2d3e]">
                <button type="button" onClick={() => setIsEfex(true)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${isEfex ? 'bg-orange-500 text-white' : 'text-[#94a3b8]'}`}>
                  EFEX Job
                </button>
                <button type="button" onClick={() => setIsEfex(false)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${!isEfex ? 'bg-[#2a2d3e] text-[#f1f5f9]' : 'text-[#94a3b8]'}`}>
                  Internal
                </button>
              </div>

              {/* ── EFEX JOB ── */}
              {isEfex && (
                <>
                  {/* Order Types */}
                  <div>
                    <SectionHeader title="Order Type" />
                    <div className="grid grid-cols-2 gap-2">
                      {EFEX_ORDER_TYPES.map(({ value, label }) => (
                        <button key={value} type="button" onClick={() => toggleOrderType(value)}
                          className={`py-3 rounded-xl border text-sm font-semibold transition ${
                            hasType(value)
                              ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                              : 'border-[#2a2d3e] text-[#94a3b8] hover:border-[#4a4d5e] bg-[#1e2130]'
                          }`}>{label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Core details */}
                  <SectionHeader title="Job Details" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <Label required>Client</Label>
                      <select value={form.client_id} onChange={e => { set('client_id', e.target.value); set('end_customer_id', '') }} className={selectCls} required>
                        <option value="">Select client…</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                    <Field>
                      <Label>End Customer</Label>
                      <select value={form.end_customer_id} onChange={e => set('end_customer_id', e.target.value)} className={selectCls} disabled={!form.client_id}>
                        <option value="">Select…</option>
                        {endCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <Label>EFEX Reference #</Label>
                      <Input value={form.client_reference} onChange={e => set('client_reference', e.target.value)} placeholder="e.g. EFX-12345" className="h-9 text-sm" />
                    </Field>
                    <Field>
                      <Label>Assigned To</Label>
                      <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} className={selectCls}>
                        <option value="">Unassigned</option>
                        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <Label>Best Contact</Label>
                      <Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="Contact name" className="h-9 text-sm" />
                    </Field>
                    <Field>
                      <Label>Contact Phone</Label>
                      <Input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} placeholder="Phone number" className="h-9 text-sm" />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <Label>Scheduled Date</Label>
                      <Input type="date" value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} className="h-9 text-sm" />
                    </Field>
                    <Field>
                      <Label>Time</Label>
                      <Input type="time" value={form.scheduled_time} onChange={e => set('scheduled_time', e.target.value)} className="h-9 text-sm" />
                    </Field>
                  </div>

                  {/* Has AOD */}
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-[#2a2d3e] bg-[#1e2130] cursor-pointer hover:border-orange-500/40">
                    <input type="checkbox" checked={form.has_aod} onChange={e => set('has_aod', e.target.checked)}
                      className="w-4 h-4 accent-orange-500" />
                    <div>
                      <p className="text-sm font-semibold text-[#f1f5f9]">📎 EFEX AOD PDF attached</p>
                      <p className="text-xs text-[#94a3b8]">Tick if EFEX has emailed their AOD PDF for this job</p>
                    </div>
                  </label>

                  {/* Machine */}
                  <SectionHeader title="Machine Details" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <Label>Model / Part #</Label>
                      <Input value={form.machine_model} onChange={e => set('machine_model', e.target.value)} placeholder="e.g. HP LaserJet Pro 4101fdw" className="h-9 text-sm" />
                    </Field>
                    <Field>
                      <Label>Serial #</Label>
                      <Input value={form.machine_serial} onChange={e => set('machine_serial', e.target.value)} placeholder="Serial number" className="h-9 text-sm" />
                    </Field>
                  </div>
                  <Field>
                    <Label>Accessories</Label>
                    <Input value={form.machine_accessories} onChange={e => set('machine_accessories', e.target.value)} placeholder="e.g. Finisher, Tray" className="h-9 text-sm" />
                  </Field>

                  {/* Install IDCA — show for Delivery or Installation */}
                  {hasDeliveryOrInstall && (
                    <div>
                      <Label>Install IDCA</Label>
                      <div className="flex items-center gap-2">
                        {(['yes', 'no'] as const).map(opt => {
                          const bv = opt === 'yes'
                          const active = form.install_idca === bv
                          return (
                            <button key={opt} type="button" onClick={() => set('install_idca', active ? null : bv)}
                              className={`px-5 py-2 rounded-lg border text-sm font-bold transition ${
                                active
                                  ? opt === 'yes' ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-red-500/20 border-red-500/40 text-red-400'
                                  : 'border-[#2a2d3e] text-[#94a3b8] hover:border-[#4a4d5e]'
                              }`}
                            >{opt.toUpperCase()}</button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Addresses */}
                  {needsAddress && (
                    <>
                      <SectionHeader title="Address" />
                      {hasRelocation && (
                        <Field>
                          <Label>Address FROM (collection)</Label>
                          <Input value={form.address_from} onChange={e => set('address_from', e.target.value)} placeholder="From address" className="h-9 text-sm" />
                        </Field>
                      )}
                      <Field>
                        <Label>{hasRelocation ? 'Address TO (destination)' : 'Delivery Address'}</Label>
                        <Input value={form.address_to} onChange={e => set('address_to', e.target.value)} placeholder="Delivery address" className="h-9 text-sm" />
                      </Field>
                      <YesNoField label="Stair Walker" value={form.stair_walker} comment={form.stair_walker_comment}
                        commentPlaceholder="Comment…" onChange={v => set('stair_walker', v)} onCommentChange={v => set('stair_walker_comment', v)} />
                      <YesNoField label="Parking" value={form.parking} comment={form.parking_comment}
                        commentPlaceholder="Parking notes…" onChange={v => set('parking', v)} onCommentChange={v => set('parking_comment', v)} />
                    </>
                  )}

                  {/* Pick-Up section */}
                  {hasPickup && (
                    <>
                      <SectionHeader title="Pick-Up Details" />
                      <div className="grid grid-cols-2 gap-3">
                        <Field>
                          <Label>Pick-Up Model</Label>
                          <Input value={form.pickup_model} onChange={e => set('pickup_model', e.target.value)} placeholder="Model name" className="h-9 text-sm" />
                        </Field>
                        <Field>
                          <Label>Pick-Up Serial</Label>
                          <Input value={form.pickup_serial} onChange={e => set('pickup_serial', e.target.value)} placeholder="Serial number" className="h-9 text-sm" />
                        </Field>
                      </div>
                      <Field>
                        <Label>Pick-Up Accessories</Label>
                        <Input value={form.pickup_accessories} onChange={e => set('pickup_accessories', e.target.value)} placeholder="Accessories" className="h-9 text-sm" />
                      </Field>
                      <div>
                        <Label>Disposition</Label>
                        <div className="flex flex-wrap gap-2">
                          {PICKUP_DISPOSITIONS.map(d => (
                            <button key={d} type="button" onClick={() => set('pickup_disposition', form.pickup_disposition === d ? '' : d)}
                              className={`px-4 py-2 rounded-lg border text-sm font-semibold transition ${
                                form.pickup_disposition === d
                                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                                  : 'border-[#2a2d3e] text-[#94a3b8] hover:border-[#4a4d5e]'
                              }`}>{d}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Special Instructions */}
                  <SectionHeader title="Special Instructions" />
                  <textarea
                    value={form.special_instructions}
                    onChange={e => set('special_instructions', e.target.value)}
                    rows={3}
                    placeholder="e.g. Call 30 mins prior, loading dock at rear…"
                    className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] placeholder:text-[#94a3b8]/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  />

                  {/* Internal notes */}
                  <div>
                    <Label>Internal Notes</Label>
                    <textarea
                      value={form.notes}
                      onChange={e => set('notes', e.target.value)}
                      rows={2}
                      placeholder="Internal notes (not printed)…"
                      className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] placeholder:text-[#94a3b8]/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                    />
                  </div>
                </>
              )}

              {/* ── INTERNAL JOB ── */}
              {!isEfex && (
                <>
                  <SectionHeader title="Internal Job" />
                  <Field>
                    <Label required>Process Type</Label>
                    <select value={form.internal_job_type} onChange={e => set('internal_job_type', e.target.value)} className={selectCls}>
                      {INTERNAL_JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <Label required>Client</Label>
                      <select value={form.client_id} onChange={e => { set('client_id', e.target.value); set('end_customer_id', '') }} className={selectCls} required>
                        <option value="">Select…</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                    <Field>
                      <Label>End Customer</Label>
                      <select value={form.end_customer_id} onChange={e => set('end_customer_id', e.target.value)} className={selectCls} disabled={!form.client_id}>
                        <option value="">Select…</option>
                        {endCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field>
                      <Label>Serial #</Label>
                      <Input value={form.machine_serial} onChange={e => set('machine_serial', e.target.value)} placeholder="Serial number" className="h-9 text-sm" />
                    </Field>
                    <Field>
                      <Label>Scheduled Date</Label>
                      <Input type="date" value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} className="h-9 text-sm" />
                    </Field>
                  </div>
                  <Field>
                    <Label>Assigned To</Label>
                    <select value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} className={selectCls}>
                      <option value="">Unassigned</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field>
                    <Label>Notes</Label>
                    <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                      className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] placeholder:text-[#94a3b8]/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none" />
                  </Field>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-[#2a2d3e] flex items-center gap-3 shrink-0 sticky bottom-0 bg-[#13161f]">
              <Button variant="outline" size="sm" onClick={onClose} type="button">Cancel</Button>
              <Button size="sm" type="submit" disabled={submitting} className="flex-1">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Job'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
