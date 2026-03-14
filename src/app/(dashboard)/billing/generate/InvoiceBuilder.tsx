'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Receipt, FileCheck, Plus, Trash2, Save,
  Loader2, AlertCircle, ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter,
} from '@/components/ui/table'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { getClientColor } from '@/lib/client-colors'
import { FUEL_SURCHARGE_RATE, GST_RATE } from '@/lib/constants'

/* ── types ─────────────────────────────────────────────────── */

interface ClientWithStats {
  id: string
  name: string
  color_code: string | null
  ready_count: number
  last_cycle_end: string | null
}

interface JobRecord {
  id: string
  job_number: string | null
  job_type: string | null
  status: string | null
  scheduled_date: string | null
  created_at: string | null
  serial_number: string | null
  order_types: string | null
  client_reference: string | null
  notes: string | null
  end_customers: { id: string; name: string } | null
  machines: { id: string; model: string; make: string | null } | null
  auto_price: number | null
  auto_price_source: string | null
  fuel_surcharge: number | null
}

interface LineItem {
  key: string
  job_id: string | null
  selected: boolean
  date: string
  customer: string
  action: string
  model: string
  serial: string
  qty: number
  price: number
  fuel: number
  sheet_type: string
  isManual: boolean
}

interface Props {
  clients: ClientWithStats[]
}

/* ── helpers ───────────────────────────────────────────────── */

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function jobTypeLabel(t: string | null): string {
  const map: Record<string, string> = {
    runup: 'Run-Up', delivery: 'Delivery', collection: 'Collection',
    install: 'Install', inwards: 'Inwards', outwards: 'Outwards',
    toner_ship: 'Toner', storage: 'Storage',
  }
  return t ? (map[t] ?? t.replace(/_/g, ' ')) : '—'
}

function sheetTypeFromJobType(jt: string | null): string {
  if (!jt) return 'misc'
  if (['delivery', 'collection', 'inwards', 'outwards'].includes(jt)) return 'inwards_outwards'
  return jt
}

/* ── Component ─────────────────────────────────────────────── */

export default function InvoiceBuilder({ clients }: Props) {
  const router = useRouter()

  /* Step 1: Client selection */
  const [selectedClient, setSelectedClient] = useState<ClientWithStats | null>(null)

  /* Step 2: Builder state */
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([])
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [cycleName, setCycleName] = useState('')
  const [fuelSurchargeOverride, setFuelSurchargeOverride] = useState<string>('')
  const [generating, setGenerating] = useState(false)

  /* When client is selected, fetch ready jobs */
  const fetchJobs = useCallback(async (client: ClientWithStats, from: string, to: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ client_id: client.id, from, to })
      const res = await fetch(`/api/billing/ready-jobs?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to fetch jobs')

      const items: LineItem[] = (json.jobs ?? []).map((job: JobRecord, idx: number) => ({
        key: `job-${job.id}-${idx}`,
        job_id: job.id,
        selected: true,
        date: job.scheduled_date ?? (job.created_at?.slice(0, 10) ?? ''),
        customer: job.end_customers?.name ?? '',
        action: job.order_types ?? jobTypeLabel(job.job_type),
        model: job.machines?.model ?? '',
        serial: job.serial_number ?? '',
        qty: 1,
        price: job.auto_price ?? 0,
        fuel: job.fuel_surcharge ?? 0,
        sheet_type: sheetTypeFromJobType(job.job_type),
        isManual: false,
      }))

      setLineItems(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  function handleSelectClient(client: ClientWithStats) {
    setSelectedClient(client)
    const from = client.last_cycle_end
      ? addDays(client.last_cycle_end, 1)
      : '2024-07-01'
    const to = todayStr()
    setPeriodStart(from)
    setPeriodEnd(to)
    setCycleName('')
    setFuelSurchargeOverride('')
    fetchJobs(client, from, to)
  }

  function addDays(dateStr: string, n: number): string {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  /* Refetch when dates change */
  function handleDateChange(field: 'start' | 'end', value: string) {
    if (field === 'start') setPeriodStart(value)
    else setPeriodEnd(value)

    if (selectedClient) {
      const from = field === 'start' ? value : periodStart
      const to = field === 'end' ? value : periodEnd
      if (from && to) fetchJobs(selectedClient, from, to)
    }
  }

  /* Line item mutations */
  function toggleItem(key: string) {
    setLineItems((prev) => prev.map((i) => i.key === key ? { ...i, selected: !i.selected } : i))
  }
  function toggleAll(checked: boolean) {
    setLineItems((prev) => prev.map((i) => ({ ...i, selected: checked })))
  }
  function updateItem(key: string, field: keyof LineItem, value: string | number) {
    setLineItems((prev) => prev.map((i) => i.key === key ? { ...i, [field]: value } : i))
  }
  function removeManualItem(key: string) {
    setLineItems((prev) => prev.filter((i) => i.key !== key))
  }
  function addManualItem() {
    setLineItems((prev) => [
      ...prev,
      {
        key: `manual-${Date.now()}`,
        job_id: null,
        selected: true,
        date: todayStr(),
        customer: '',
        action: '',
        model: '',
        serial: '',
        qty: 1,
        price: 0,
        fuel: 0,
        sheet_type: 'misc',
        isManual: true,
      },
    ])
  }

  /* Computed totals */
  const selected = useMemo(() => lineItems.filter((i) => i.selected), [lineItems])
  const allSelected = lineItems.length > 0 && selected.length === lineItems.length

  const subtotal = useMemo(
    () => selected.reduce((sum, i) => sum + i.qty * i.price, 0),
    [selected]
  )
  const fuelTotal = useMemo(() => {
    if (fuelSurchargeOverride !== '') return Number(fuelSurchargeOverride) || 0
    return selected.reduce((sum, i) => sum + (i.fuel ?? 0), 0)
  }, [selected, fuelSurchargeOverride])

  const taxableAmount = subtotal + fuelTotal
  const gst = Math.round(taxableAmount * GST_RATE * 100) / 100
  const grandTotal = Math.round((taxableAmount + gst) * 100) / 100

  /* Generate invoice */
  async function handleGenerate() {
    if (!selectedClient || selected.length === 0) return
    setGenerating(true)
    setError('')
    try {
      const payload = {
        client_id: selectedClient.id,
        period_start: periodStart,
        period_end: periodEnd,
        cycle_name: cycleName || undefined,
        fuel_surcharge_total: fuelTotal,
        line_items: selected.map((item) => ({
          job_id: item.job_id,
          description: item.action,
          qty: item.qty,
          price_ex: item.price,
          fuel_surcharge: item.fuel,
          sheet_type: item.sheet_type,
          customer: item.customer,
          model: item.model,
          serial: item.serial,
          action: item.action,
          job_date: item.date,
        })),
      }

      const res = await fetch('/api/billing/generate-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate invoice')

      router.push(`/billing/${json.billing_cycle_id}/preview`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setGenerating(false)
    }
  }

  /* Save draft to localStorage */
  function handleSaveDraft() {
    if (!selectedClient) return
    const draft = {
      client_id: selectedClient.id,
      period_start: periodStart,
      period_end: periodEnd,
      cycle_name: cycleName,
      fuel_surcharge_override: fuelSurchargeOverride,
      line_items: lineItems,
      saved_at: new Date().toISOString(),
    }
    localStorage.setItem(`invoice_draft_${selectedClient.id}`, JSON.stringify(draft))
    setError('')
    alert('Draft saved successfully')
  }

  /* Load draft from localStorage */
  useEffect(() => {
    if (!selectedClient) return
    const saved = localStorage.getItem(`invoice_draft_${selectedClient.id}`)
    if (saved) {
      try {
        const draft = JSON.parse(saved)
        // Only restore if reasonably fresh (< 7 days)
        const savedAt = new Date(draft.saved_at)
        const daysSince = (Date.now() - savedAt.getTime()) / (1000 * 60 * 60 * 24)
        if (daysSince < 7 && draft.line_items?.length > 0) {
          const restore = confirm(
            `Found a draft from ${formatDate(draft.saved_at)}. Restore it?`
          )
          if (restore) {
            setPeriodStart(draft.period_start)
            setPeriodEnd(draft.period_end)
            setCycleName(draft.cycle_name || '')
            setFuelSurchargeOverride(draft.fuel_surcharge_override || '')
            setLineItems(draft.line_items)
            return
          }
        }
      } catch { /* ignore */ }
    }
  }, [selectedClient])

  /* ── RENDER ──────────────────────────────────────────────── */

  // Step 1: Client selection
  if (!selectedClient) {
    return (
      <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/billing" className="text-[#94a3b8] hover:text-[#f1f5f9] transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[#f1f5f9]">Generate Invoice</h1>
            <p className="text-sm text-[#94a3b8] mt-0.5">
              Select a client to build an invoice from their completed jobs.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => {
            const color = getClientColor(client.name, client.color_code)
            return (
              <Card
                key={client.id}
                className="cursor-pointer hover:border-[#4a4d5e] transition-colors group"
                onClick={() => handleSelectClient(client)}
              >
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <h3 className="font-semibold text-[#f1f5f9] text-lg">{client.name}</h3>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#4a4d5e] group-hover:text-[#94a3b8] transition-colors" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#94a3b8]">Ready to bill</span>
                      <span
                        className="font-bold px-2 py-0.5 rounded-full text-xs"
                        style={{
                          backgroundColor: client.ready_count > 0 ? `${color}20` : '#2a2d3e',
                          color: client.ready_count > 0 ? color : '#64748b',
                        }}
                      >
                        {client.ready_count} job{client.ready_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#94a3b8]">Last invoiced</span>
                      <span className="text-[#f1f5f9] text-xs">
                        {client.last_cycle_end ? formatDate(client.last_cycle_end) : 'Never'}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>

        {clients.every((c) => c.ready_count === 0) && (
          <div className="text-center py-12">
            <Receipt className="w-12 h-12 text-[#2a2d3e] mx-auto mb-3" />
            <p className="text-[#94a3b8]">No clients have un-invoiced jobs right now.</p>
          </div>
        )}
      </div>
    )
  }

  // Step 2: Invoice Builder
  const clientColor = getClientColor(selectedClient.name, selectedClient.color_code)

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedClient(null); setLineItems([]) }}
            className="text-[#94a3b8] hover:text-[#f1f5f9] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: clientColor }} />
              <h1 className="text-2xl font-bold text-[#f1f5f9]">{selectedClient.name}</h1>
            </div>
            <p className="text-sm text-[#94a3b8] mt-0.5">
              All jobs from {formatDate(periodStart)} to {formatDate(periodEnd)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#94a3b8]">From</label>
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => handleDateChange('start', e.target.value)}
              className="w-[150px] h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#94a3b8]">To</label>
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => handleDateChange('end', e.target.value)}
              className="w-[150px] h-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Optional cycle name override */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-[#94a3b8] whitespace-nowrap">Cycle Name</label>
        <Input
          value={cycleName}
          onChange={(e) => setCycleName(e.target.value)}
          placeholder="Auto-generated from dates"
          className="max-w-sm h-8 text-xs"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Line Items Table */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-[#94a3b8]">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading jobs…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Action / Type</TableHead>
                  <TableHead className="hidden md:table-cell">Model</TableHead>
                  <TableHead className="w-16 text-center">Qty</TableHead>
                  <TableHead className="w-28 text-right">Price (ex GST)</TableHead>
                  <TableHead className="w-24 text-right">Total</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-[#64748b]">
                      No jobs found for this period. Try adjusting the date range.
                    </TableCell>
                  </TableRow>
                )}
                {lineItems.map((item) => (
                  <TableRow
                    key={item.key}
                    className={cn(
                      !item.selected && 'opacity-40',
                      item.isManual && 'bg-[#1a1d27]/50'
                    )}
                  >
                    <TableCell>
                      <Checkbox
                        checked={item.selected}
                        onCheckedChange={() => toggleItem(item.key)}
                      />
                    </TableCell>
                    <TableCell className="text-[#f1f5f9] text-xs whitespace-nowrap">
                      {item.isManual ? (
                        <Input
                          type="date"
                          value={item.date}
                          onChange={(e) => updateItem(item.key, 'date', e.target.value)}
                          className="w-[130px] h-7 text-xs"
                        />
                      ) : (
                        formatDate(item.date)
                      )}
                    </TableCell>
                    <TableCell className="text-[#f1f5f9] text-sm">
                      {item.isManual ? (
                        <Input
                          value={item.customer}
                          onChange={(e) => updateItem(item.key, 'customer', e.target.value)}
                          placeholder="Customer"
                          className="h-7 text-xs min-w-[120px]"
                        />
                      ) : (
                        item.customer || '—'
                      )}
                    </TableCell>
                    <TableCell className="text-[#f1f5f9] text-sm">
                      {item.isManual ? (
                        <Input
                          value={item.action}
                          onChange={(e) => updateItem(item.key, 'action', e.target.value)}
                          placeholder="Description"
                          className="h-7 text-xs min-w-[140px]"
                        />
                      ) : (
                        item.action
                      )}
                    </TableCell>
                    <TableCell className="text-sm hidden md:table-cell">
                      {item.isManual ? (
                        <Input
                          value={item.model}
                          onChange={(e) => updateItem(item.key, 'model', e.target.value)}
                          placeholder="Model"
                          className="h-7 text-xs min-w-[100px]"
                        />
                      ) : (
                        item.model || '—'
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number"
                        min={0}
                        value={item.qty}
                        onChange={(e) => updateItem(item.key, 'qty', Number(e.target.value))}
                        className="h-7 text-xs text-center w-16 mx-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={item.price || ''}
                        onChange={(e) => updateItem(item.key, 'price', Number(e.target.value))}
                        className="h-7 text-xs text-right w-24 ml-auto"
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell className="text-right text-[#f1f5f9] font-medium text-sm whitespace-nowrap">
                      {formatCurrency(item.qty * item.price)}
                    </TableCell>
                    <TableCell>
                      {item.isManual && (
                        <button
                          onClick={() => removeManualItem(item.key)}
                          className="text-[#64748b] hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Add manual item */}
        <div className="px-4 py-3 border-t border-[#2a2d3e]">
          <Button
            variant="outline"
            size="sm"
            onClick={addManualItem}
            className="text-xs"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Manual Item
          </Button>
        </div>
      </Card>

      {/* Totals */}
      <Card>
        <div className="p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#f1f5f9] uppercase tracking-wider">Invoice Summary</h3>

          <div className="flex justify-between items-center text-sm">
            <span className="text-[#94a3b8]">
              Subtotal ({selected.length} item{selected.length !== 1 ? 's' : ''})
            </span>
            <span className="text-[#f1f5f9] font-medium">{formatCurrency(subtotal)}</span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[#94a3b8]">Fuel Surcharge</span>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={fuelSurchargeOverride}
                onChange={(e) => setFuelSurchargeOverride(e.target.value)}
                placeholder="Auto"
                className="h-7 text-xs w-24"
              />
            </div>
            <span className="text-[#f1f5f9] font-medium">{formatCurrency(fuelTotal)}</span>
          </div>

          <div className="flex justify-between items-center text-sm border-t border-[#2a2d3e] pt-2">
            <span className="text-[#94a3b8]">GST (10%)</span>
            <span className="text-[#f1f5f9] font-medium">{formatCurrency(gst)}</span>
          </div>

          <div className="flex justify-between items-center text-lg font-bold border-t border-[#2a2d3e] pt-3">
            <span className="text-[#f1f5f9]">Grand Total</span>
            <span style={{ color: clientColor }}>{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <Button
          variant="outline"
          onClick={handleSaveDraft}
          disabled={selected.length === 0}
        >
          <Save className="w-4 h-4 mr-1" />
          Save Draft
        </Button>
        <Button
          onClick={handleGenerate}
          disabled={selected.length === 0 || generating}
          className="bg-[#f97316] text-[#0f1117] hover:bg-[#ea580c]"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <FileCheck className="w-4 h-4 mr-1" />
          )}
          {generating ? 'Generating…' : `Generate Invoice (${selected.length} items)`}
        </Button>
      </div>
    </div>
  )
}
