'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Printer, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  SlideOver,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn, formatDate, formatCurrency } from '@/lib/utils'

interface Client { id: string; name: string }

interface TonerItem {
  sku: string
  description: string
  qty: number
  unit_price: number
}

interface TonerOrder {
  id: string
  efex_ni: string | null
  courier: string | null
  tracking_number: string | null
  weight_kg: number | null
  dispatch_date: string | null
  est_delivery: string | null
  status: string | null
  total_price: number | null
  items: TonerItem[] | null
  created_at: string | null
  jobs: { client_id: string | null; clients: { id: string; name: string } | null } | null
}

const courierStyles: Record<string, string> = {
  GO_Logistics:    'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  TNT:             'bg-red-500/15 text-red-400 border border-red-500/30',
  Couriers_Please: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  StarTrack:       'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  Other:           'bg-[#2a2d3e] text-[#94a3b8]',
}

const courierLabels: Record<string, string> = {
  GO_Logistics: 'GO Logistics',
  TNT: 'TNT',
  Couriers_Please: 'Couriers Please',
  StarTrack: 'StarTrack',
  Other: 'Other',
}

const courierTracking: Record<string, string> = {
  TNT: 'https://www.tnt.com/express/en_au/site/shipping-tools/tracking.html?searchType=con&cons=',
  StarTrack: 'https://startrack.com.au/track-and-trace?id=',
  Couriers_Please: 'https://www.couriersplease.com.au/tools/track?consignment=',
}

const statusStyles: Record<string, string> = {
  pending:    'bg-[#2a2d3e] text-[#94a3b8]',
  packed:     'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  dispatched: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  delivered:  'bg-green-500/15 text-green-400 border border-green-500/30',
}

const statusLabels: Record<string, string> = {
  pending: 'Pending', packed: 'Packed', dispatched: 'Dispatched', delivered: 'Delivered',
}

interface Props {
  initialOrders: TonerOrder[]
  clients: Client[]
}

const emptyItem = (): TonerItem => ({ sku: '', description: '', qty: 1, unit_price: 0 })

export default function TonerClient({ initialOrders, clients }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Filters
  const [courierFilter, setCourierFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // New order form
  const [newOpen, setNewOpen] = useState(false)
  const [form, setForm] = useState({
    client_id: '',
    courier: 'GO_Logistics',
    efex_ni: '',
    tracking_number: '',
    dispatch_date: new Date().toISOString().split('T')[0],
    est_delivery: '',
    weight_kg: '',
    total_price: '',
  })
  const [lineItems, setLineItems] = useState<TonerItem[]>([emptyItem()])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Status update
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const filtered = initialOrders.filter(o => {
    if (courierFilter !== 'all' && o.courier !== courierFilter) return false
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (dateFrom && o.dispatch_date && o.dispatch_date < dateFrom) return false
    if (dateTo && o.dispatch_date && o.dispatch_date > dateTo) return false
    return true
  })

  function addItem() { setLineItems(l => [...l, emptyItem()]) }
  function removeItem(idx: number) { setLineItems(l => l.filter((_, i) => i !== idx)) }
  function updateItem(idx: number, field: keyof TonerItem, value: string | number) {
    setLineItems(l => l.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  const computedTotal = lineItems.reduce((sum, item) => sum + (item.qty * item.unit_price), 0)

  async function handleSubmit() {
    setSaving(true); setFormError('')
    try {
      const res = await fetch('/api/toner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          client_id: form.client_id || null,
          weight_kg: parseFloat(form.weight_kg) || null,
          total_price: parseFloat(form.total_price) || computedTotal || null,
          items: lineItems.filter(i => i.description),
        }),
      })
      const json = await res.json()
      if (!res.ok) { setFormError(json.error || 'Failed to create order'); return }
      setNewOpen(false)
      setForm({ client_id: '', courier: 'GO_Logistics', efex_ni: '', tracking_number: '', dispatch_date: new Date().toISOString().split('T')[0], est_delivery: '', weight_kg: '', total_price: '' })
      setLineItems([emptyItem()])
      startTransition(() => router.refresh())
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id)
    try {
      await fetch(`/api/toner/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      startTransition(() => router.refresh())
    } finally {
      setUpdatingId(null)
    }
  }

  function trackingUrl(order: TonerOrder): string | null {
    if (!order.tracking_number || !order.courier) return null
    const base = courierTracking[order.courier]
    return base ? `${base}${order.tracking_number}` : null
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">Toner Orders</h1>
          <p className="text-sm text-[#94a3b8] mt-0.5">{filtered.length} orders</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/export/toner"
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2d3e] text-xs font-medium text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition-colors"
          >
            ⬇ Export CSV
          </a>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4" />
            New Order
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={courierFilter} onValueChange={setCourierFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Couriers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Couriers</SelectItem>
            <SelectItem value="GO_Logistics">GO Logistics</SelectItem>
            <SelectItem value="TNT">TNT</SelectItem>
            <SelectItem value="Couriers_Please">Couriers Please</SelectItem>
            <SelectItem value="StarTrack">StarTrack</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="packed">Packed</SelectItem>
            <SelectItem value="dispatched">Dispatched</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
      </div>

      <Card>
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2d3e]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">EFEX NI</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Courier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Tracking</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden md:table-cell">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden sm:table-cell">Items</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden sm:table-cell">Weight</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2d3e]">
                {filtered.map(order => {
                  const courier = order.courier ?? ''
                  const status = order.status ?? 'pending'
                  const trackUrl = trackingUrl(order)
                  const items = Array.isArray(order.items) ? order.items : []
                  const clientName = (order.jobs as { clients?: { name: string } | null } | null)?.clients?.name
                  return (
                    <tr key={order.id} className="hover:bg-[#1a1d27] transition-colors">
                      <td className="px-4 py-3 text-xs text-[#94a3b8] whitespace-nowrap">{formatDate(order.dispatch_date)}</td>
                      <td className="px-4 py-3 font-mono font-semibold text-orange-400">{order.efex_ni || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', courierStyles[courier] ?? 'bg-[#2a2d3e] text-[#94a3b8]')}>
                          {courierLabels[courier] ?? courier}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {order.tracking_number ? (
                          trackUrl ? (
                            <a href={trackUrl} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 flex items-center gap-1">
                              {order.tracking_number}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-[#94a3b8]">{order.tracking_number}</span>
                          )
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {clientName ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[#2a2d3e] text-[#94a3b8]">{clientName}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#94a3b8] hidden sm:table-cell">
                        {items.length > 0
                          ? `${items.length} item${items.length !== 1 ? 's' : ''}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#94a3b8] hidden sm:table-cell">
                        {order.weight_kg ? `${order.weight_kg} kg` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={status}
                          onValueChange={v => updateStatus(order.id, v)}
                          disabled={updatingId === order.id}
                        >
                          <SelectTrigger className="w-32 h-7 text-xs border-0 p-0 bg-transparent focus:ring-0">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusStyles[status] ?? 'bg-[#2a2d3e] text-[#94a3b8]')}>
                              {statusLabels[status] ?? status}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="packed">Packed</SelectItem>
                            <SelectItem value="dispatched">Dispatched</SelectItem>
                            <SelectItem value="delivered">Delivered</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#f1f5f9]">
                        {formatCurrency(order.total_price)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center text-center gap-3">
            <Printer className="w-12 h-12 text-[#2a2d3e]" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-[#f1f5f9]">No toner orders</p>
              <p className="text-sm text-[#94a3b8] mt-0.5">Adjust filters or create a new order.</p>
            </div>
          </div>
        )}
      </Card>

      {/* New Order Slide-Over */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <SlideOver width="max-w-2xl">
          <div className="flex flex-col h-full">
            <div className="px-6 py-5 border-b border-[#2a2d3e]">
              <DialogTitle>New Toner Order</DialogTitle>
              <DialogDescription>Create a toner pack & ship order.</DialogDescription>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {formError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{formError}</p>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Client</Label>
                  <Select value={form.client_id || 'none'} onValueChange={v => setForm(f => ({ ...f, client_id: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No client</SelectItem>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Courier *</Label>
                  <Select value={form.courier} onValueChange={v => setForm(f => ({ ...f, courier: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GO_Logistics">GO Logistics</SelectItem>
                      <SelectItem value="TNT">TNT</SelectItem>
                      <SelectItem value="Couriers_Please">Couriers Please</SelectItem>
                      <SelectItem value="StarTrack">StarTrack</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>EFEX NI Ref</Label>
                  <Input value={form.efex_ni} onChange={e => setForm(f => ({ ...f, efex_ni: e.target.value }))} placeholder="NI-001234" className="font-mono" />
                </div>
                <div>
                  <Label>Tracking Number</Label>
                  <Input value={form.tracking_number} onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))} className="font-mono" />
                </div>
                <div>
                  <Label>Dispatch Date</Label>
                  <Input type="date" value={form.dispatch_date} onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))} />
                </div>
                <div>
                  <Label>Est. Delivery</Label>
                  <Input type="date" value={form.est_delivery} onChange={e => setForm(f => ({ ...f, est_delivery: e.target.value }))} />
                </div>
                <div>
                  <Label>Weight (kg)</Label>
                  <Input type="number" step="0.1" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} />
                </div>
                <div>
                  <Label>Total Price (override)</Label>
                  <Input type="number" step="0.01" value={form.total_price} onChange={e => setForm(f => ({ ...f, total_price: e.target.value }))} placeholder={computedTotal > 0 ? `Auto: $${computedTotal.toFixed(2)}` : '0.00'} />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Items</Label>
                  <Button size="sm" variant="outline" onClick={addItem}>
                    <Plus className="w-3 h-3" />
                    Add Item
                  </Button>
                </div>
                <div className="space-y-2">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-2">
                        <Input value={item.sku} onChange={e => updateItem(idx, 'sku', e.target.value)} placeholder="SKU" className="text-xs font-mono" />
                      </div>
                      <div className="col-span-5">
                        <Input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Description" className="text-xs" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', parseInt(e.target.value) || 1)} min={1} className="text-xs" />
                      </div>
                      <div className="col-span-2">
                        <Input type="number" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="text-xs" />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button onClick={() => removeItem(idx)} className="text-[#94a3b8] hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {computedTotal > 0 && (
                  <p className="text-right text-sm text-[#94a3b8] mt-2">
                    Items total: <span className="font-semibold text-[#f1f5f9]">{formatCurrency(computedTotal)}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2d3e] flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={saving || !form.courier}>
                {saving ? 'Saving...' : 'Create Order'}
              </Button>
            </div>
          </div>
        </SlideOver>
      </Dialog>
    </div>
  )
}
