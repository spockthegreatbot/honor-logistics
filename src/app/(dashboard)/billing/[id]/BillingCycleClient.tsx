'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Calculator, Plus, Trash2, ChevronDown, AlertCircle,
  CheckCircle2, Clock, DollarSign, Package, Truck, Wrench, Database, Printer
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, SlideOver, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn, formatDate, formatCurrency } from '@/lib/utils'

type BillingStatus = 'open' | 'review' | 'invoiced' | 'paid'

interface PricingRule {
  id: string
  job_type: string
  line_item_name: string
  unit_price: number
  storage_type?: string | null
}

interface StorageWeeklyRow {
  id: string
  week_label: string | null
  storage_type: string | null
  qty: number | null
  cost_ex: number | null
  total_ex: number | null
  notes: string | null
}

interface JobRecord {
  id: string
  job_type: string
  job_number: string | null
  status: string | null
  scheduled_date: string | null
  serial_number: string | null
  billing_cycle_id: string | null
  clients: { id: string; name: string } | null
  end_customers: { id: string; name: string } | null
  machines: { id: string; model: string; make: string | null } | null
  // Supabase returns related rows as arrays even for 1:1 relations
  runup_details: { unit_price: number | null }[] | null
  install_details: { unit_price: number | null }[] | null
  delivery_details: {
    base_price: number | null
    fuel_surcharge_amt: number | null
    fuel_override: boolean | null
    subtype: string | null
  }[] | null
  toner_orders: { total_price: number | null }[] | null
}

interface BillingCycleData {
  id: string
  cycle_name: string | null
  period_start: string
  period_end: string
  financial_year: string | null
  status: string | null
  discount_amount: number | null
  total_runup: number | null
  total_delivery: number | null
  total_fuel_surcharge: number | null
  total_install: number | null
  total_storage: number | null
  total_toner: number | null
  total_inwards_outwards: number | null
  subtotal: number | null
  gst_amount: number | null
  grand_total: number | null
  xero_invoice_id: string | null
  xero_invoice_number: string | null
  clients: { id: string; name: string; billing_email: string | null } | null
}

interface Props {
  cycle: BillingCycleData
  jobs: JobRecord[]
  storageWeekly: StorageWeeklyRow[]
  pricingRules: PricingRule[]
}

const statusStyles: Record<string, string> = {
  open:     'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  review:   'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  invoiced: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  paid:     'bg-green-500/15 text-green-400 border border-green-500/30',
}

const STORAGE_TYPES = [
  'Warehouse Storage',
  'Shelf Storage',
  'Assessment',
  'GRA',
  'Pallet Storage',
  'Secure Storage',
  'Other',
]

function LineItem({ label, amount, bold, indent }: { label: string; amount: number | null; bold?: boolean; indent?: boolean }) {
  return (
    <div className={cn('flex justify-between items-center py-1.5', indent && 'pl-4')}>
      <span className={cn('text-sm', bold ? 'font-semibold text-[#f1f5f9]' : 'text-[#94a3b8]')}>{label}</span>
      <span className={cn('font-mono text-sm tabular-nums', bold ? 'font-bold text-[#f1f5f9]' : 'text-[#94a3b8]')}>
        {formatCurrency(amount ?? 0)}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="border-t border-[#2a2d3e] my-2" />
}

export default function BillingCycleClient({ cycle, jobs, storageWeekly, pricingRules }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Local state for live totals (recalculated client-side too)
  const [totals, setTotals] = useState({
    total_runup: cycle.total_runup ?? 0,
    total_delivery: cycle.total_delivery ?? 0,
    total_fuel_surcharge: cycle.total_fuel_surcharge ?? 0,
    total_install: cycle.total_install ?? 0,
    total_storage: cycle.total_storage ?? 0,
    total_toner: cycle.total_toner ?? 0,
    total_inwards_outwards: cycle.total_inwards_outwards ?? 0,
    subtotal: cycle.subtotal ?? 0,
    gst_amount: cycle.gst_amount ?? 0,
    grand_total: cycle.grand_total ?? 0,
  })

  const [discount, setDiscount] = useState(String(cycle.discount_amount ?? 0))
  const [savingDiscount, setSavingDiscount] = useState(false)
  const [calculating, setCalculating] = useState(false)

  // Storage form
  const [storageOpen, setStorageOpen] = useState(false)
  const [storageRows, setStorageRows] = useState<StorageWeeklyRow[]>(storageWeekly)
  const [storageForm, setStorageForm] = useState({
    week_label: '', storage_type: 'Warehouse Storage', qty: '1', cost_ex: '', notes: '',
  })
  const [savingStorage, setSavingStorage] = useState(false)

  // Add jobs
  const [addJobsOpen, setAddJobsOpen] = useState(false)
  const [availableJobs, setAvailableJobs] = useState<JobRecord[]>([])
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set())
  const [addingJobs, setAddingJobs] = useState(false)

  // Close cycle modal
  const [closeOpen, setCloseOpen] = useState(false)
  const [closing, setClosing] = useState(false)

  // Delete cycle modal
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [error, setError] = useState('')

  const [currentStatus, setCurrentStatus] = useState(cycle.status ?? 'open')
  const isEditable = currentStatus === 'open'
  const isInvoiced = currentStatus === 'invoiced'

  async function unlockCycle() {
    const res = await fetch(`/api/billing/${cycle.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'review' }),
    })
    if (res.ok) {
      setCurrentStatus('review')
      startTransition(() => router.refresh())
    }
  }

  // Compute subtotals from jobs for the right panel
  const runupJobs = jobs.filter(j => j.job_type === 'runup')
  const deliveryJobs = jobs.filter(j => j.job_type === 'delivery' || j.job_type === 'collection')
  const installJobs = jobs.filter(j => j.job_type === 'install')
  const tonerJobs = jobs.filter(j => j.job_type === 'toner_ship' || j.job_type === 'toner')

  async function runCalculate() {
    setCalculating(true)
    try {
      const res = await fetch(`/api/billing/${cycle.id}/calculate`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        setTotals(json.totals)
      }
    } finally {
      setCalculating(false)
    }
  }

  async function saveDiscount() {
    setSavingDiscount(true)
    try {
      const disc = parseFloat(discount) || 0
      await fetch(`/api/billing/${cycle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discount_amount: disc }),
      })
      // Recalculate
      await runCalculate()
    } finally {
      setSavingDiscount(false)
    }
  }

  async function addStorageLine() {
    setSavingStorage(true)
    try {
      const res = await fetch(`/api/billing/${cycle.id}/storage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...storageForm,
          qty: parseFloat(storageForm.qty) || 1,
          cost_ex: parseFloat(storageForm.cost_ex) || 0,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to add storage'); return }
      setStorageRows(r => [...r, json.data])
      setStorageForm({ week_label: '', storage_type: 'Warehouse Storage', qty: '1', cost_ex: '', notes: '' })
      setStorageOpen(false)
      await runCalculate()
    } finally {
      setSavingStorage(false)
    }
  }

  async function deleteStorageLine(storageId: string) {
    await fetch(`/api/billing/${cycle.id}/storage?storage_id=${storageId}`, { method: 'DELETE' })
    setStorageRows(r => r.filter(row => row.id !== storageId))
    await runCalculate()
  }

  async function loadAvailableJobs() {
    setLoadingJobs(true)
    try {
      const res = await fetch(`/api/billing/${cycle.id}/jobs`)
      const json = await res.json()
      setAvailableJobs(json.data ?? [])
    } finally {
      setLoadingJobs(false)
    }
  }

  function openAddJobs() {
    setAddJobsOpen(true)
    loadAvailableJobs()
    setSelectedJobIds(new Set())
  }

  async function handleAddJobs() {
    if (selectedJobIds.size === 0) return
    setAddingJobs(true)
    try {
      await fetch(`/api/billing/${cycle.id}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_ids: Array.from(selectedJobIds) }),
      })
      setAddJobsOpen(false)
      startTransition(() => router.refresh())
      await runCalculate()
    } finally {
      setAddingJobs(false)
    }
  }

  async function closeCycle() {
    setClosing(true)
    try {
      await fetch(`/api/billing/${cycle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'review' }),
      })
      setCloseOpen(false)
      startTransition(() => router.refresh())
    } finally {
      setClosing(false)
    }
  }

  async function deleteCycle() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/billing/${cycle.id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/billing')
      } else {
        const { error } = await res.json()
        setError(error ?? 'Delete failed')
        setDeleteOpen(false)
      }
    } finally {
      setDeleting(false)
    }
  }

  // Get pricing for storage type
  function getStoragePrice(storageType: string): number {
    const rule = pricingRules.find(r => r.job_type === 'storage' && r.line_item_name.toLowerCase().includes(storageType.toLowerCase()))
    return rule?.unit_price ?? 0
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/billing" className="text-[#94a3b8] hover:text-[#f1f5f9] transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#f1f5f9]">{cycle.cycle_name ?? `Cycle ${cycle.id.slice(0, 8)}`}</h1>
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', statusStyles[currentStatus] ?? 'bg-[#2a2d3e] text-[#94a3b8]')}>
                {currentStatus}
              </span>
            </div>
            <p className="text-sm text-[#94a3b8]">
              {cycle.clients?.name} · {formatDate(cycle.period_start)} – {formatDate(cycle.period_end)}
              {cycle.financial_year && ` · ${cycle.financial_year}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={runCalculate} disabled={calculating}>
            <Calculator className="w-4 h-4" />
            {calculating ? 'Calculating...' : 'Recalculate'}
          </Button>
          {isEditable && (
            <Button size="sm" variant="secondary" onClick={() => setCloseOpen(true)}>
              Close Cycle
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDeleteOpen(true)}
            className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 hover:text-red-300"
          >
            Delete
          </Button>
        </div>
      </div>

      {isInvoiced && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-purple-400">
            <AlertCircle className="w-4 h-4" />
            This billing cycle is <strong>invoiced</strong> and locked. Editing is disabled.
          </div>
          <Button size="sm" variant="outline" onClick={unlockCycle} className="border-purple-500/40 text-purple-400 hover:bg-purple-500/10">
            Unlock
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* LEFT — Invoice Breakdown */}
        <div className="lg:col-span-2">
          <Card className="p-5 sticky top-4">
            <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Invoice Breakdown</h2>

            <LineItem label="Machine Run Ups" amount={totals.total_runup} />
            <LineItem label="Delivery & Collection" amount={totals.total_delivery} />
            <LineItem label="Fuel Surcharge 11%" amount={totals.total_fuel_surcharge} indent />
            <LineItem label="Machine Install" amount={totals.total_install} />
            <LineItem label="Storage + Misc" amount={totals.total_storage} />

            {/* Discount */}
            <div className="flex justify-between items-center py-1.5">
              <span className="text-sm text-[#94a3b8]">Discount</span>
              <div className="flex items-center gap-2">
                <span className="text-[#94a3b8] text-sm">−$</span>
                <input
                  type="number"
                  step="0.01"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  onBlur={saveDiscount}
                  disabled={!isEditable || savingDiscount}
                  className="w-24 text-right text-sm font-mono bg-[#1a1d27] border border-[#2a2d3e] rounded px-2 py-1 text-[#f1f5f9] focus:outline-none focus:ring-1 focus:ring-orange-500/50 disabled:opacity-50"
                />
              </div>
            </div>

            <Divider />
            <LineItem label="Subtotal ex GST" amount={totals.subtotal} bold />
            <LineItem label="GST 10%" amount={totals.gst_amount} />

            <Divider />
            <div className="flex justify-between items-center py-2">
              <span className="text-base font-bold text-[#f1f5f9]">TOTAL AUD</span>
              <span className="text-base font-bold text-orange-400 font-mono">{formatCurrency(totals.grand_total)}</span>
            </div>

            {/* Xero placeholder */}
            <div className="mt-4 pt-4 border-t border-[#2a2d3e]">
              {cycle.xero_invoice_id ? (
                <div className="text-xs text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Invoice #{cycle.xero_invoice_number}
                </div>
              ) : (
                <Button size="sm" variant="outline" className="w-full opacity-60" disabled>
                  <AlertCircle className="w-4 h-4" />
                  Xero not connected yet
                </Button>
              )}
              <Link
                href={`/billing/${cycle.id}/preview`}
                target="_blank"
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a2d3e] text-xs font-medium text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition-colors"
              >
                📄 Preview Invoice
              </Link>
              <a
                href={`/api/billing/${cycle.id}/export?format=xlsx`}
                download
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a2d3e] text-xs font-medium text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition-colors"
              >
                ⬇ Download Excel
              </a>
              <a
                href={`/api/billing/${cycle.id}/export?format=pdf`}
                download
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#2a2d3e] text-xs font-medium text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition-colors"
              >
                ⬇ Download PDF
              </a>
            </div>
          </Card>
        </div>

        {/* RIGHT — Jobs */}
        <div className="lg:col-span-3">
          <Tabs defaultValue="runups">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <TabsList>
                <TabsTrigger value="runups">
                  <span className="flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    Run-Ups <span className="text-xs opacity-60">({runupJobs.length})</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger value="deliveries">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5" />
                    Deliveries <span className="text-xs opacity-60">({deliveryJobs.length})</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger value="installs">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Installs <span className="text-xs opacity-60">({installJobs.length})</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger value="storage">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    Storage <span className="text-xs opacity-60">({storageRows.length})</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger value="toner">
                  <span className="flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5" />
                    Toner <span className="text-xs opacity-60">({tonerJobs.length})</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger value="line_items">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    All Items
                  </span>
                </TabsTrigger>
              </TabsList>
              {isEditable && (
                <Button size="sm" variant="outline" onClick={openAddJobs}>
                  <Plus className="w-3.5 h-3.5" />
                  Add Job
                </Button>
              )}
            </div>

            {/* Run-Ups Tab */}
            <TabsContent value="runups">
              <Card>
                {runupJobs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2a2d3e]">
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Job</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Machine</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase hidden sm:table-cell">Date</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a2d3e]">
                        {runupJobs.map(job => (
                          <tr key={job.id} className="hover:bg-[#1a1d27]">
                            <td className="px-4 py-2 font-mono text-xs text-orange-400">{job.job_number || '—'}</td>
                            <td className="px-4 py-2 text-xs text-[#f1f5f9]">
                              <div>{job.machines?.model || 'Unknown'}</div>
                              <div className="text-[#94a3b8]">{job.serial_number || ''}</div>
                            </td>
                            <td className="px-4 py-2 text-xs text-[#94a3b8] hidden sm:table-cell">{formatDate(job.scheduled_date)}</td>
                            <td className="px-4 py-2 text-right font-mono text-sm text-[#f1f5f9]">
                              {formatCurrency(Array.isArray(job.runup_details) ? (job.runup_details[0]?.unit_price ?? 0) : 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#2a2d3e] bg-[#1a1d27]">
                          <td colSpan={3} className="px-4 py-2 text-xs text-[#94a3b8] font-medium">Total</td>
                          <td className="px-4 py-2 text-right font-semibold text-orange-400 font-mono">
                            {formatCurrency(runupJobs.reduce((s, j) => s + (Array.isArray(j.runup_details) ? (j.runup_details[0]?.unit_price ?? 0) : 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <EmptyJobsState type="Run-Up" onAdd={openAddJobs} editable={isEditable} />
                )}
              </Card>
            </TabsContent>

            {/* Deliveries Tab */}
            <TabsContent value="deliveries">
              <Card>
                {deliveryJobs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2a2d3e]">
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Job</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Type</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase hidden sm:table-cell">Date</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Base</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Fuel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a2d3e]">
                        {deliveryJobs.map(job => (
                          <tr key={job.id} className="hover:bg-[#1a1d27]">
                            <td className="px-4 py-2 font-mono text-xs text-orange-400">{job.job_number || '—'}</td>
                            <td className="px-4 py-2 text-xs text-[#94a3b8] capitalize">{(Array.isArray(job.delivery_details) ? job.delivery_details[0]?.subtype : null) || job.job_type}</td>
                            <td className="px-4 py-2 text-xs text-[#94a3b8] hidden sm:table-cell">{formatDate(job.scheduled_date)}</td>
                            <td className="px-4 py-2 text-right font-mono text-sm text-[#f1f5f9]">
                              {formatCurrency(Array.isArray(job.delivery_details) ? (job.delivery_details[0]?.base_price ?? 0) : 0)}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs text-[#94a3b8]">
                              {Array.isArray(job.delivery_details) && job.delivery_details[0]?.fuel_override ? (
                                <span className="text-[#64748b] text-xs">FP</span>
                              ) : (
                                formatCurrency(Array.isArray(job.delivery_details) ? (job.delivery_details[0]?.fuel_surcharge_amt ?? 0) : 0)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#2a2d3e] bg-[#1a1d27]">
                          <td colSpan={3} className="px-4 py-2 text-xs text-[#94a3b8] font-medium">Total</td>
                          <td className="px-4 py-2 text-right font-semibold text-orange-400 font-mono">
                            {formatCurrency(deliveryJobs.reduce((s, j) => s + (Array.isArray(j.delivery_details) ? (j.delivery_details[0]?.base_price ?? 0) : 0), 0))}
                          </td>
                          <td className="px-4 py-2 text-right text-xs text-[#94a3b8] font-mono">
                            {formatCurrency(deliveryJobs.reduce((s, j) => s + (Array.isArray(j.delivery_details) && !j.delivery_details[0]?.fuel_override ? (j.delivery_details[0]?.fuel_surcharge_amt ?? 0) : 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <EmptyJobsState type="Delivery" onAdd={openAddJobs} editable={isEditable} />
                )}
              </Card>
            </TabsContent>

            {/* Installs Tab */}
            <TabsContent value="installs">
              <Card>
                {installJobs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2a2d3e]">
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Job</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Customer</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase hidden sm:table-cell">Date</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a2d3e]">
                        {installJobs.map(job => (
                          <tr key={job.id} className="hover:bg-[#1a1d27]">
                            <td className="px-4 py-2 font-mono text-xs text-orange-400">{job.job_number || '—'}</td>
                            <td className="px-4 py-2 text-xs text-[#f1f5f9]">{job.end_customers?.name || '—'}</td>
                            <td className="px-4 py-2 text-xs text-[#94a3b8] hidden sm:table-cell">{formatDate(job.scheduled_date)}</td>
                            <td className="px-4 py-2 text-right font-mono text-sm text-[#f1f5f9]">
                              {formatCurrency(Array.isArray(job.install_details) ? (job.install_details[0]?.unit_price ?? 0) : 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#2a2d3e] bg-[#1a1d27]">
                          <td colSpan={3} className="px-4 py-2 text-xs text-[#94a3b8] font-medium">Total</td>
                          <td className="px-4 py-2 text-right font-semibold text-orange-400 font-mono">
                            {formatCurrency(installJobs.reduce((s, j) => s + (Array.isArray(j.install_details) ? (j.install_details[0]?.unit_price ?? 0) : 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <EmptyJobsState type="Install" onAdd={openAddJobs} editable={isEditable} />
                )}
              </Card>
            </TabsContent>

            {/* Storage Tab */}
            <TabsContent value="storage">
              <Card>
                <div className="p-3 border-b border-[#2a2d3e] flex justify-between items-center">
                  <span className="text-sm text-[#94a3b8]">Weekly storage lines</span>
                  {isEditable && (
                    <Button size="sm" variant="outline" onClick={() => setStorageOpen(true)}>
                      <Plus className="w-3.5 h-3.5" />
                      Add Line
                    </Button>
                  )}
                </div>
                {storageRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2a2d3e]">
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Week</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Type</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Qty</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Cost Ex</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Total Ex</th>
                          {isEditable && <th className="px-4 py-2"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a2d3e]">
                        {storageRows.map(row => (
                          <tr key={row.id} className="hover:bg-[#1a1d27]">
                            <td className="px-4 py-2 text-xs text-[#94a3b8]">{row.week_label || '—'}</td>
                            <td className="px-4 py-2 text-xs text-[#f1f5f9]">{row.storage_type || '—'}</td>
                            <td className="px-4 py-2 text-right text-xs text-[#94a3b8]">{row.qty ?? 1}</td>
                            <td className="px-4 py-2 text-right font-mono text-xs text-[#94a3b8]">{formatCurrency(row.cost_ex)}</td>
                            <td className="px-4 py-2 text-right font-mono text-sm text-[#f1f5f9]">{formatCurrency(row.total_ex)}</td>
                            {isEditable && (
                              <td className="px-4 py-2">
                                <button onClick={() => deleteStorageLine(row.id)} className="text-[#94a3b8] hover:text-red-400 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#2a2d3e] bg-[#1a1d27]">
                          <td colSpan={4} className="px-4 py-2 text-xs text-[#94a3b8] font-medium">Total</td>
                          <td className="px-4 py-2 text-right font-semibold text-orange-400 font-mono">
                            {formatCurrency(storageRows.reduce((s, r) => s + (r.total_ex ?? 0), 0))}
                          </td>
                          {isEditable && <td />}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="py-10 text-center text-[#94a3b8] text-sm">
                    No storage lines yet.{isEditable && ' Click "Add Line" to add weekly storage.'}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* Toner Tab */}
            <TabsContent value="toner">
              <Card>
                {tonerJobs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2a2d3e]">
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Job</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase hidden sm:table-cell">Date</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#2a2d3e]">
                        {tonerJobs.map(job => {
                          const tonerTotal = Array.isArray(job.toner_orders)
                            ? job.toner_orders.reduce((s: number, t: { total_price: number | null }) => s + (t.total_price ?? 0), 0)
                            : 0
                          return (
                            <tr key={job.id} className="hover:bg-[#1a1d27]">
                              <td className="px-4 py-2 font-mono text-xs text-orange-400">{job.job_number || '—'}</td>
                              <td className="px-4 py-2 text-xs text-[#94a3b8] hidden sm:table-cell">{formatDate(job.scheduled_date)}</td>
                              <td className="px-4 py-2 text-right font-mono text-sm text-[#f1f5f9]">{formatCurrency(tonerTotal)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#2a2d3e] bg-[#1a1d27]">
                          <td colSpan={2} className="px-4 py-2 text-xs text-[#94a3b8] font-medium">Total</td>
                          <td className="px-4 py-2 text-right font-semibold text-orange-400 font-mono">
                            {formatCurrency(tonerJobs.reduce((s, j) => {
                              const t = Array.isArray(j.toner_orders) ? j.toner_orders.reduce((ts: number, t: { total_price: number | null }) => ts + (t.total_price ?? 0), 0) : 0
                              return s + t
                            }, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <EmptyJobsState type="Toner" onAdd={openAddJobs} editable={isEditable} />
                )}
              </Card>
            </TabsContent>

            {/* All Line Items Tab — from billing_line_items (imported Excel data) */}
            <TabsContent value="line_items">
              <LineItemsTab cycleId={cycle.id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Storage Add Slide-Over */}
      <Dialog open={storageOpen} onOpenChange={setStorageOpen}>
        <SlideOver width="max-w-md">
          <div className="flex flex-col h-full">
            <div className="px-6 py-5 border-b border-[#2a2d3e]">
              <DialogTitle>Add Storage Line</DialogTitle>
              <DialogDescription>Add a weekly storage billing entry.</DialogDescription>
            </div>
            <div className="flex-1 px-6 py-5 space-y-4">
              <div>
                <Label>Week Label</Label>
                <Input value={storageForm.week_label} onChange={e => setStorageForm(f => ({ ...f, week_label: e.target.value }))} placeholder="e.g. Week 31" />
              </div>
              <div>
                <Label>Storage Type</Label>
                <Select value={storageForm.storage_type} onValueChange={v => {
                  const price = getStoragePrice(v)
                  setStorageForm(f => ({ ...f, storage_type: v, cost_ex: price > 0 ? String(price) : f.cost_ex }))
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STORAGE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Qty</Label>
                  <Input type="number" value={storageForm.qty} onChange={e => setStorageForm(f => ({ ...f, qty: e.target.value }))} min={1} />
                </div>
                <div>
                  <Label>Cost Ex (per unit)</Label>
                  <Input type="number" step="0.01" value={storageForm.cost_ex} onChange={e => setStorageForm(f => ({ ...f, cost_ex: e.target.value }))} />
                </div>
              </div>
              {storageForm.qty && storageForm.cost_ex && (
                <div className="flex justify-between text-sm py-1 border-t border-[#2a2d3e]">
                  <span className="text-[#94a3b8]">Total Ex</span>
                  <span className="font-semibold text-[#f1f5f9]">{formatCurrency((parseFloat(storageForm.qty) || 0) * (parseFloat(storageForm.cost_ex) || 0))}</span>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[#2a2d3e] flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStorageOpen(false)}>Cancel</Button>
              <Button onClick={addStorageLine} disabled={savingStorage}>
                {savingStorage ? 'Saving...' : 'Add Line'}
              </Button>
            </div>
          </div>
        </SlideOver>
      </Dialog>

      {/* Add Jobs Slide-Over */}
      <Dialog open={addJobsOpen} onOpenChange={setAddJobsOpen}>
        <SlideOver width="max-w-2xl">
          <div className="flex flex-col h-full">
            <div className="px-6 py-5 border-b border-[#2a2d3e]">
              <DialogTitle>Add Jobs to Cycle</DialogTitle>
              <DialogDescription>Select complete jobs not yet assigned to a billing cycle.</DialogDescription>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingJobs ? (
                <div className="p-8 text-center text-[#94a3b8]">Loading available jobs...</div>
              ) : availableJobs.length === 0 ? (
                <div className="p-8 text-center text-[#94a3b8]">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  No eligible jobs. Jobs must be complete and not yet invoiced.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#1e2130]">
                    <tr className="border-b border-[#2a2d3e]">
                      <th className="px-4 py-2 text-left w-10">
                        <input
                          type="checkbox"
                          checked={selectedJobIds.size === availableJobs.length}
                          onChange={e => setSelectedJobIds(e.target.checked ? new Set(availableJobs.map(j => j.id)) : new Set())}
                          className="accent-orange-500"
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Job</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Type</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase hidden sm:table-cell">Customer</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase hidden sm:table-cell">Date</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2d3e]">
                    {availableJobs.map(job => {
                      const amount = (Array.isArray(job.runup_details) ? job.runup_details[0]?.unit_price : null)
                        ?? (Array.isArray(job.install_details) ? job.install_details[0]?.unit_price : null)
                        ?? (Array.isArray(job.delivery_details) ? job.delivery_details[0]?.base_price : null)
                        ?? 0
                      return (
                        <tr
                          key={job.id}
                          className={cn('hover:bg-[#1a1d27] cursor-pointer', selectedJobIds.has(job.id) && 'bg-orange-500/5')}
                          onClick={() => setSelectedJobIds(s => {
                            const next = new Set(s)
                            if (next.has(job.id)) next.delete(job.id)
                            else next.add(job.id)
                            return next
                          })}
                        >
                          <td className="px-4 py-2">
                            <input type="checkbox" checked={selectedJobIds.has(job.id)} onChange={() => {}} className="accent-orange-500" />
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-orange-400">{job.job_number || '—'}</td>
                          <td className="px-4 py-2 text-xs text-[#94a3b8] capitalize">{job.job_type.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-2 text-xs text-[#f1f5f9] hidden sm:table-cell">{job.end_customers?.name || job.clients?.name || '—'}</td>
                          <td className="px-4 py-2 text-xs text-[#94a3b8] hidden sm:table-cell">{formatDate(job.scheduled_date)}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-[#f1f5f9]">{formatCurrency(amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[#2a2d3e] flex items-center justify-between gap-2">
              <span className="text-xs text-[#94a3b8]">{selectedJobIds.size} selected</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAddJobsOpen(false)}>Cancel</Button>
                <Button onClick={handleAddJobs} disabled={addingJobs || selectedJobIds.size === 0}>
                  {addingJobs ? 'Adding...' : `Add ${selectedJobIds.size} Job${selectedJobIds.size !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </div>
        </SlideOver>
      </Dialog>

      {/* Close Cycle Modal */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <div className={cn('fixed inset-0 z-50 flex items-center justify-center', !closeOpen && 'hidden')}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCloseOpen(false)} />
          <div className="relative z-50 bg-[#1e2130] border border-[#2a2d3e] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-lg font-semibold text-[#f1f5f9] mb-1">Close Billing Cycle</h2>
            <p className="text-sm text-[#94a3b8] mb-5">
              This will change the cycle status to "In Review". You can still edit it before invoicing.
            </p>

            <div className="bg-[#1a1d27] rounded-lg p-4 space-y-2 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-[#94a3b8]">Subtotal</span>
                <span className="font-mono text-[#f1f5f9]">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#94a3b8]">Discount</span>
                <span className="font-mono text-[#94a3b8]">−{formatCurrency(parseFloat(discount) || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#94a3b8]">GST (10%)</span>
                <span className="font-mono text-[#f1f5f9]">{formatCurrency(totals.gst_amount)}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t border-[#2a2d3e]">
                <span className="text-[#f1f5f9]">Grand Total</span>
                <span className="font-mono text-orange-400">{formatCurrency(totals.grand_total)}</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancel</Button>
              <Button onClick={closeCycle} disabled={closing}>
                {closing ? 'Closing...' : 'Close Cycle'}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Delete Cycle Modal */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <div className={cn('fixed inset-0 z-50 flex items-center justify-center', !deleteOpen && 'hidden')}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteOpen(false)} />
          <div className="relative z-50 bg-[#1e2130] border border-red-500/30 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-xl">🗑️</div>
              <h2 className="text-lg font-semibold text-[#f1f5f9]">Delete Billing Cycle?</h2>
            </div>
            <p className="text-sm text-[#94a3b8] mb-3">
              This will <strong className="text-red-400">permanently delete</strong> the cycle <strong className="text-[#f1f5f9]">{cycle.cycle_name}</strong> and all associated jobs, run-ups, deliveries, installs, and storage records.
            </p>
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3 mb-5 text-sm text-red-400">
              ⚠️ This cannot be undone.
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
              <Button
                onClick={deleteCycle}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white border-0"
              >
                {deleting ? 'Deleting...' : 'Yes, delete permanently'}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

const SHEET_LABELS: Record<string, string> = {
  runup: 'Run Up', install: 'Install', delivery: 'Delivery & Collection',
  toner: 'Toner', storage: 'Storage', inwards_outwards: 'Inwards & Outwards'
}

function LineItemsTab({ cycleId }: { cycleId: string }) {
  const [items, setItems] = React.useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = React.useState(true)
  const [filter, setFilter] = React.useState('all')

  React.useEffect(() => {
    fetch(`/api/billing/${cycleId}/line-items`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [cycleId])

  const types = ['all', ...Array.from(new Set(items.map((i: Record<string, unknown>) => i.sheet_type as string))).sort()]
  const displayed = filter === 'all' ? items : items.filter((i: Record<string, unknown>) => i.sheet_type === filter)

  if (loading) return <Card className="p-6 text-center text-sm text-[#94a3b8]">Loading line items…</Card>
  if (!items.length) return <Card className="p-6 text-center text-sm text-[#94a3b8]">No line items imported for this cycle.</Card>

  return (
    <Card>
      <div className="px-4 py-3 border-b border-[#2a2d3e] flex gap-2 flex-wrap">
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={cn('px-3 py-1 rounded text-xs font-medium transition-colors',
              filter === t ? 'bg-orange-500/20 text-orange-400' : 'text-[#94a3b8] hover:text-[#f1f5f9]'
            )}>
            {t === 'all' ? `All (${items.length})` : `${SHEET_LABELS[t] ?? t} (${items.filter((i: Record<string, unknown>) => i.sheet_type === t).length})`}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[#0f1117]">
            <tr className="border-b border-[#2a2d3e]">
              <th className="px-3 py-2 text-left text-[#94a3b8] uppercase">Type</th>
              <th className="px-3 py-2 text-left text-[#94a3b8] uppercase">Date</th>
              <th className="px-3 py-2 text-left text-[#94a3b8] uppercase">Customer</th>
              <th className="px-3 py-2 text-left text-[#94a3b8] uppercase">Description</th>
              <th className="px-3 py-2 text-left text-[#94a3b8] uppercase hidden md:table-cell">Serial</th>
              <th className="px-3 py-2 text-right text-[#94a3b8] uppercase">Qty</th>
              <th className="px-3 py-2 text-right text-[#94a3b8] uppercase">Price</th>
              <th className="px-3 py-2 text-right text-[#94a3b8] uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2130]">
            {displayed.map((item: Record<string, unknown>) => (
              <tr key={item.id as string} className="hover:bg-[#1a1d27]">
                <td className="px-3 py-1.5 text-[#64748b]">{SHEET_LABELS[item.sheet_type as string] ?? item.sheet_type as string}</td>
                <td className="px-3 py-1.5 text-[#94a3b8]">{item.job_date ? new Date(item.job_date as string + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}</td>
                <td className="px-3 py-1.5 text-[#f1f5f9] max-w-[150px] truncate">{(item.customer as string) || (item.notes as string) || '—'}</td>
                <td className="px-3 py-1.5 text-[#94a3b8] max-w-[200px] truncate">{(item.action as string) || (item.model as string) || '—'}</td>
                <td className="px-3 py-1.5 text-[#64748b] hidden md:table-cell">{(item.serial as string) || (item.efex_ni as string) || '—'}</td>
                <td className="px-3 py-1.5 text-right text-[#94a3b8]">{item.qty as number ?? '—'}</td>
                <td className="px-3 py-1.5 text-right text-[#94a3b8] font-mono">{item.price_ex != null ? `$${(item.price_ex as number).toFixed(2)}` : '—'}</td>
                <td className="px-3 py-1.5 text-right text-[#f1f5f9] font-mono font-medium">{item.total_ex != null ? `$${(item.total_ex as number).toFixed(2)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-[#2a2d3e]">
            <tr>
              <td colSpan={7} className="px-3 py-2 text-right text-xs text-[#94a3b8]">Total ex GST</td>
              <td className="px-3 py-2 text-right text-sm font-bold text-orange-400 font-mono">
                ${displayed.reduce((s: number, i: Record<string, unknown>) => s + ((i.total_ex as number) ?? 0), 0).toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

function EmptyJobsState({ type, onAdd, editable }: { type: string; onAdd: () => void; editable: boolean }) {
  return (
    <div className="py-10 flex flex-col items-center text-center gap-2">
      <p className="text-sm text-[#94a3b8]">No {type} jobs in this cycle.</p>
      {editable && (
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5" />
          Add Jobs
        </Button>
      )}
    </div>
  )
}
