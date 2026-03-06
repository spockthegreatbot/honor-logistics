'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Client { id: string; name: string }
interface EndCustomer { id: string; name: string; client_id: string | null }
interface Staff { id: string; name: string }

interface Props {
  onClose: () => void
  onCreated?: (job: never) => void
}

const JOB_TYPES = [
  { value: 'runup',     label: 'Run-Up' },
  { value: 'delivery',  label: 'Delivery' },
  { value: 'collection',label: 'Collection' },
  { value: 'install',   label: 'Install' },
  { value: 'inwards',   label: 'Inwards' },
  { value: 'outwards',  label: 'Outwards' },
  { value: 'toner_ship',label: 'Toner Ship' },
  { value: 'storage',   label: 'Storage' },
]

export function NewJobSlideOver({ onClose, onCreated }: Props) {
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [endCustomers, setEndCustomers] = useState<EndCustomer[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    job_type: 'runup',
    client_id: '',
    end_customer_id: '',
    machine_model: '',
    machine_serial: '',
    scheduled_date: '',
    assigned_to: '',
    po_number: '',
    notes: '',
  })

  useEffect(() => {
    async function loadMeta() {
      try {
        const [clientsRes, staffRes] = await Promise.all([
          fetch('/api/meta/clients'),
          fetch('/api/meta/staff'),
        ])
        if (clientsRes.ok) setClients(await clientsRes.json())
        if (staffRes.ok) setStaff(await staffRes.json())
        if (!clientsRes.ok || !staffRes.ok) {
          setError('Failed to load form data. Please close and reopen.')
        }
      } catch {
        setError('Network error loading form data. Please close and reopen.')
      }
      setLoadingMeta(false)
    }
    loadMeta()
  }, [])

  useEffect(() => {
    async function loadCustomers() {
      if (!form.client_id) {
        setEndCustomers([])
        return
      }
      try {
        const res = await fetch(`/api/meta/end-customers?client_id=${form.client_id}`)
        if (res.ok) setEndCustomers(await res.json())
      } catch {}
    }
    loadCustomers()
  }, [form.client_id])

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_id) { setError('Please select a client'); return }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create job')
      } else {
        onCreated?.(data.job as never)
        router.refresh()
        onClose()
      }
    } catch {
      setError('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#1a1d27] border-l border-[#2a2d3e] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2d3e] shrink-0">
          <h2 className="text-base font-semibold text-[#f1f5f9]">New Job</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#2a2d3e] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">
            {/* Job Type */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#94a3b8] mb-1.5">
                Job Type <span className="text-red-400">*</span>
              </label>
              <select
                value={form.job_type}
                onChange={(e) => set('job_type', e.target.value)}
                className="w-full h-9 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {JOB_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Client */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#94a3b8] mb-1.5">
                Client <span className="text-red-400">*</span>
              </label>
              <select
                value={form.client_id}
                onChange={(e) => { set('client_id', e.target.value); set('end_customer_id', '') }}
                className="w-full h-9 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">— Select client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* End Customer */}
            {endCustomers.length > 0 && (
              <div>
                <label className="block text-xs uppercase tracking-wider text-[#94a3b8] mb-1.5">
                  End Customer
                </label>
                <select
                  value={form.end_customer_id}
                  onChange={(e) => set('end_customer_id', e.target.value)}
                  className="w-full h-9 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">— Select end customer —</option>
                  {endCustomers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Machine Model */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#94a3b8] mb-1.5">
                Machine Model
              </label>
              <Input
                placeholder="e.g. Kyocera TASKalfa 2554ci"
                value={form.machine_model}
                onChange={(e) => set('machine_model', e.target.value)}
              />
            </div>

            {/* Serial */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#94a3b8] mb-1.5">
                Serial Number
              </label>
              <Input
                placeholder="e.g. VDL3P02547"
                value={form.machine_serial}
                onChange={(e) => set('machine_serial', e.target.value)}
                className="font-mono"
              />
            </div>

            {/* Scheduled Date */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#94a3b8] mb-1.5">
                Scheduled Date
              </label>
              <Input
                type="date"
                value={form.scheduled_date}
                onChange={(e) => set('scheduled_date', e.target.value)}
                className="[color-scheme:dark]"
              />
            </div>

            {/* Assigned To */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#94a3b8] mb-1.5">
                Assigned To
              </label>
              <select
                value={form.assigned_to}
                onChange={(e) => set('assigned_to', e.target.value)}
                className="w-full h-9 rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] px-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">— Unassigned —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* PO Number */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#94a3b8] mb-1.5">
                PO Number
              </label>
              <Input
                placeholder="e.g. PO-12345"
                value={form.po_number}
                onChange={(e) => set('po_number', e.target.value)}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#94a3b8] mb-1.5">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                rows={3}
                placeholder="Any additional notes…"
                className="w-full rounded-lg border border-[#2a2d3e] bg-[#0f1117] text-sm text-[#f1f5f9] placeholder:text-[#94a3b8]/60 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#2a2d3e] flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} type="button">Cancel</Button>
          <Button size="sm" onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Job'}
          </Button>
        </div>
      </div>
    </>
  )
}
