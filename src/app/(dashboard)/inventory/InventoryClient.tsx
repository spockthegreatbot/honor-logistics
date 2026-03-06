'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Package, Search, Filter, ArrowUpDown, X, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogTrigger,
  SlideOver,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn, formatDate } from '@/lib/utils'

interface Client { id: string; name: string }
interface InventoryItem {
  id: string
  description: string | null
  brand: string | null
  serial_number: string | null
  product_code: string | null
  location: string | null
  pallet_location: string | null
  uom: string | null
  item_class: string | null
  condition: string | null
  end_customer_ref: string | null
  inwards_date: string | null
  outwards_date: string | null
  is_active: boolean | null
  notes: string | null
  quantity: number | null
  days_in_storage: number | null
  clients: { id: string; name: string } | null
}

interface Movement {
  id: string
  movement_type: string
  po_number: string | null
  sender_name: string | null
  receiver_name: string | null
  product_code: string | null
  serial_number: string | null
  pallet_location: string | null
  quantity: number | null
  movement_date: string | null
  notes: string | null
}

const conditionStyles: Record<string, string> = {
  new:          'bg-green-500/15 text-green-400 border border-green-500/30',
  refurb:       'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  faulty:       'bg-red-500/15 text-red-400 border border-red-500/30',
  for_disposal: 'bg-[#2a2d3e] text-[#94a3b8]',
}

const conditionLabels: Record<string, string> = {
  new: 'New', refurb: 'Refurb', faulty: 'Faulty', for_disposal: 'For Disposal',
}

function daysColor(days: number | null) {
  if (days === null) return 'text-[#94a3b8]'
  if (days < 30) return 'text-green-400'
  if (days < 90) return 'text-yellow-400'
  if (days < 365) return 'text-orange-400'
  return 'text-red-400'
}

function MovementBadge({ type }: { type: string }) {
  const isIn = type === 'inwards'
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      isIn ? 'bg-green-500/15 text-green-400 border border-green-500/30' : 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
    )}>
      {isIn ? '↓ Inwards' : '↑ Outwards'}
    </span>
  )
}

interface Props {
  initialItems: InventoryItem[]
  initialMovements: Movement[]
  clients: Client[]
}

export default function InventoryClient({ initialItems, initialMovements, clients }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  
  // Filters
  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')
  const [conditionFilter, setConditionFilter] = useState('all')
  const [showActive, setShowActive] = useState(true)

  // Sorting
  const [sortKey, setSortKey] = useState<string>('inwards_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Slide-overs
  const [inwardsOpen, setInwardsOpen] = useState(false)
  const [outwardsOpen, setOutwardsOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)

  // Movements filter
  const [movTypeFilter, setMovTypeFilter] = useState('all')
  const [movDateFrom, setMovDateFrom] = useState('')
  const [movDateTo, setMovDateTo] = useState('')

  // Form state — inwards
  const [inForm, setInForm] = useState({
    description: '', brand: '', serial_number: '', product_code: '',
    location: '', pallet_location: '', uom: '', item_class: 'machine',
    condition: 'new', client_id: '', end_customer_ref: '', inwards_date: '',
    notes: '', quantity: '1',
  })

  // Form state — outwards
  const [outForm, setOutForm] = useState({
    outwards_date: new Date().toISOString().split('T')[0],
    receiver: '', notes: '',
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Filter items
  const filteredItems = initialItems.filter(item => {
    if (showActive && !item.is_active) return false
    if (!showActive && item.is_active) return false
    if (clientFilter !== 'all' && item.clients?.id !== clientFilter) return false
    if (classFilter !== 'all' && item.item_class !== classFilter) return false
    if (conditionFilter !== 'all' && item.condition !== conditionFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        item.serial_number?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q) ||
        item.product_code?.toLowerCase().includes(q) ||
        item.brand?.toLowerCase().includes(q)
      )
    }
    return true
  })

  // Sort items
  const sortedItems = [...filteredItems].sort((a, b) => {
    let aVal: string | number | null = null
    let bVal: string | number | null = null
    switch (sortKey) {
      case 'days_in_storage': aVal = a.days_in_storage; bVal = b.days_in_storage; break
      case 'description': aVal = a.description; bVal = b.description; break
      case 'brand': aVal = a.brand; bVal = b.brand; break
      case 'location': aVal = a.location; bVal = b.location; break
      case 'inwards_date': aVal = a.inwards_date; bVal = b.inwards_date; break
      case 'client': aVal = a.clients?.name ?? null; bVal = b.clients?.name ?? null; break
      default: aVal = a.inwards_date; bVal = b.inwards_date
    }
    if (aVal === null) return 1
    if (bVal === null) return -1
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortHead({ k, label }: { k: string; label: string }) {
    return (
      <th
        className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider cursor-pointer select-none hover:text-[#f1f5f9] transition-colors"
        onClick={() => toggleSort(k)}
      >
        <span className="flex items-center gap-1">
          {label}
          {sortKey === k && <ArrowUpDown className="w-3 h-3 opacity-70" />}
        </span>
      </th>
    )
  }

  // Filtered movements
  const filteredMovements = initialMovements.filter(m => {
    if (movTypeFilter !== 'all' && m.movement_type !== movTypeFilter) return false
    if (movDateFrom && m.movement_date && m.movement_date < movDateFrom) return false
    if (movDateTo && m.movement_date && m.movement_date > movDateTo) return false
    return true
  })

  async function handleInwards() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...inForm,
          quantity: parseInt(inForm.quantity) || 1,
          client_id: inForm.client_id || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to add item'); return }
      setInwardsOpen(false)
      setInForm({ description: '', brand: '', serial_number: '', product_code: '', location: '', pallet_location: '', uom: '', item_class: 'machine', condition: 'new', client_id: '', end_customer_ref: '', inwards_date: '', notes: '', quantity: '1' })
      startTransition(() => router.refresh())
    } finally {
      setSaving(false)
    }
  }

  async function handleOutwards() {
    if (!selectedItem) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/inventory/${selectedItem.id}/outwards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outForm),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to mark outwards'); return }
      setOutwardsOpen(false)
      setSelectedItem(null)
      startTransition(() => router.refresh())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">Inventory / SOH</h1>
          <p className="text-sm text-[#94a3b8] mt-0.5">{filteredItems.length} items {showActive ? 'in storage' : 'dispatched'}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/export/inventory"
            download
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2a2d3e] text-xs font-medium text-[#94a3b8] hover:text-[#f1f5f9] hover:border-[#3a3d4e] transition-colors"
          >
            ⬇ Export CSV
          </a>
          <Button size="sm" onClick={() => setInwardsOpen(true)}>
            <Plus className="w-4 h-4" />
            Log Inwards
          </Button>
        </div>
      </div>

      <Tabs defaultValue="soh">
        <TabsList>
          <TabsTrigger value="soh">SOH / Stock</TabsTrigger>
          <TabsTrigger value="movements">Movements Log</TabsTrigger>
        </TabsList>

        <TabsContent value="soh">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94a3b8]" />
              <Input
                placeholder="Search serial, description..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="machine">Machine</SelectItem>
                <SelectItem value="pallet">Pallet</SelectItem>
                <SelectItem value="accessory">Accessory</SelectItem>
                <SelectItem value="parts">Parts</SelectItem>
              </SelectContent>
            </Select>
            <Select value={conditionFilter} onValueChange={setConditionFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Conditions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Conditions</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="refurb">Refurb</SelectItem>
                <SelectItem value="faulty">Faulty</SelectItem>
                <SelectItem value="for_disposal">For Disposal</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => setShowActive(v => !v)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                showActive
                  ? 'bg-green-500/15 text-green-400 border-green-500/30'
                  : 'bg-orange-500/15 text-orange-400 border-orange-500/30'
              )}
            >
              {showActive ? 'In Storage' : 'Dispatched'}
            </button>
            {(search || clientFilter !== 'all' || classFilter !== 'all' || conditionFilter !== 'all') && (
              <button
                onClick={() => { setSearch(''); setClientFilter('all'); setClassFilter('all'); setConditionFilter('all') }}
                className="text-xs text-[#94a3b8] hover:text-[#f1f5f9] flex items-center gap-1 px-2"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          <Card>
            {sortedItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2d3e]">
                      <SortHead k="location" label="Location" />
                      <SortHead k="brand" label="Brand" />
                      <SortHead k="description" label="Description" />
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Serial No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden md:table-cell">Product Code</th>
                      <SortHead k="client" label="Client" />
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden lg:table-cell">End Cust. Ref</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Condition</th>
                      <SortHead k="days_in_storage" label="Days" />
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden md:table-cell">UOM</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2d3e]">
                    {sortedItems.map(item => {
                      const cond = item.condition ?? ''
                      const days = item.days_in_storage
                      return (
                        <tr key={item.id} className="hover:bg-[#1a1d27] transition-colors">
                          <td className="px-4 py-3 text-[#94a3b8] text-xs">
                            <div>{item.location || '—'}</div>
                            {item.pallet_location && <div className="text-[#64748b]">{item.pallet_location}</div>}
                          </td>
                          <td className="px-4 py-3 text-[#94a3b8]">{item.brand || '—'}</td>
                          <td className="px-4 py-3 font-medium text-[#f1f5f9] max-w-[200px]">
                            <div className="truncate">{item.description || '—'}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[#94a3b8]">{item.serial_number || '—'}</td>
                          <td className="px-4 py-3 font-mono text-xs text-[#94a3b8] hidden md:table-cell">{item.product_code || '—'}</td>
                          <td className="px-4 py-3">
                            {item.clients?.name ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[#2a2d3e] text-[#94a3b8]">
                                {item.clients.name}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#94a3b8] hidden lg:table-cell">{item.end_customer_ref || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', conditionStyles[cond] ?? 'bg-[#2a2d3e] text-[#94a3b8]')}>
                              {conditionLabels[cond] ?? cond}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {days !== null ? (
                              <span className={cn('font-medium text-xs', daysColor(days))}>{days}d</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-[#94a3b8] hidden md:table-cell">{item.uom || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                              item.is_active
                                ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                                : 'bg-[#2a2d3e] text-[#94a3b8]'
                            )}>
                              {item.is_active ? 'Active' : 'Dispatched'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {item.is_active && (
                              <button
                                onClick={() => { setSelectedItem(item); setOutForm({ outwards_date: new Date().toISOString().split('T')[0], receiver: '', notes: '' }); setOutwardsOpen(true) }}
                                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors px-2 py-1 rounded border border-orange-500/30 hover:border-orange-400/50"
                              >
                                <Truck className="w-3 h-3" />
                                Outwards
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 flex flex-col items-center text-center gap-3">
                <Package className="w-12 h-12 text-[#2a2d3e]" strokeWidth={1.5} />
                <div>
                  <p className="font-semibold text-[#f1f5f9]">No inventory items</p>
                  <p className="text-sm text-[#94a3b8] mt-0.5">Adjust filters or log new inwards items.</p>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="movements">
          {/* Movements filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Select value={movTypeFilter} onValueChange={setMovTypeFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="inwards">Inwards</SelectItem>
                <SelectItem value="outwards">Outwards</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={movDateFrom} onChange={e => setMovDateFrom(e.target.value)} className="w-36" placeholder="From" />
            <Input type="date" value={movDateTo} onChange={e => setMovDateTo(e.target.value)} className="w-36" placeholder="To" />
          </div>

          <Card>
            {filteredMovements.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a2d3e]">
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden sm:table-cell">PO #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider">Sender / Receiver</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden md:table-cell">Product Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden md:table-cell">Serial</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden lg:table-cell">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[#94a3b8] uppercase tracking-wider hidden lg:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2d3e]">
                    {filteredMovements.map(m => (
                      <tr key={m.id} className="hover:bg-[#1a1d27] transition-colors">
                        <td className="px-4 py-3 text-[#94a3b8] text-xs whitespace-nowrap">{formatDate(m.movement_date)}</td>
                        <td className="px-4 py-3"><MovementBadge type={m.movement_type} /></td>
                        <td className="px-4 py-3 font-mono text-xs text-[#94a3b8] hidden sm:table-cell">{m.po_number || '—'}</td>
                        <td className="px-4 py-3 text-[#f1f5f9] text-xs">
                          {m.sender_name && <div>From: {m.sender_name}</div>}
                          {m.receiver_name && <div>To: {m.receiver_name}</div>}
                          {!m.sender_name && !m.receiver_name && '—'}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[#94a3b8] hidden md:table-cell">{m.product_code || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-[#94a3b8] hidden md:table-cell">{m.serial_number || '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#94a3b8] hidden lg:table-cell">{m.pallet_location || '—'}</td>
                        <td className="px-4 py-3 text-xs text-[#94a3b8] hidden lg:table-cell max-w-[200px]">
                          <div className="truncate">{m.notes || '—'}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 flex flex-col items-center text-center gap-3">
                <Package className="w-12 h-12 text-[#2a2d3e]" strokeWidth={1.5} />
                <p className="font-semibold text-[#f1f5f9]">No movements recorded</p>
                <p className="text-sm text-[#94a3b8]">Inwards and outwards movements will appear here.</p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Inwards Slide-Over */}
      <Dialog open={inwardsOpen} onOpenChange={setInwardsOpen}>
        <SlideOver width="max-w-xl">
          <div className="flex flex-col h-full">
            <div className="px-6 py-5 border-b border-[#2a2d3e]">
              <DialogTitle>Log Inwards Item</DialogTitle>
              <DialogDescription>Record a new item arriving into the warehouse.</DialogDescription>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
              
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Description *</Label>
                  <Input value={inForm.description} onChange={e => setInForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Konica Minolta C308" />
                </div>
                <div>
                  <Label>Brand</Label>
                  <Input value={inForm.brand} onChange={e => setInForm(f => ({ ...f, brand: e.target.value }))} placeholder="Konica Minolta" />
                </div>
                <div>
                  <Label>Serial Number</Label>
                  <Input value={inForm.serial_number} onChange={e => setInForm(f => ({ ...f, serial_number: e.target.value }))} placeholder="A1J123456" className="font-mono" />
                </div>
                <div>
                  <Label>Product Code</Label>
                  <Input value={inForm.product_code} onChange={e => setInForm(f => ({ ...f, product_code: e.target.value }))} className="font-mono" />
                </div>
                <div>
                  <Label>UOM</Label>
                  <Input value={inForm.uom} onChange={e => setInForm(f => ({ ...f, uom: e.target.value }))} placeholder="EA" />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={inForm.location} onChange={e => setInForm(f => ({ ...f, location: e.target.value }))} placeholder="Bay A / Shelf 2" />
                </div>
                <div>
                  <Label>Pallet Location</Label>
                  <Input value={inForm.pallet_location} onChange={e => setInForm(f => ({ ...f, pallet_location: e.target.value }))} placeholder="P-01" />
                </div>
                <div>
                  <Label>Item Class</Label>
                  <Select value={inForm.item_class} onValueChange={v => setInForm(f => ({ ...f, item_class: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="machine">Machine</SelectItem>
                      <SelectItem value="pallet">Pallet</SelectItem>
                      <SelectItem value="accessory">Accessory</SelectItem>
                      <SelectItem value="parts">Parts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Condition</Label>
                  <Select value={inForm.condition} onValueChange={v => setInForm(f => ({ ...f, condition: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="refurb">Refurb</SelectItem>
                      <SelectItem value="faulty">Faulty</SelectItem>
                      <SelectItem value="for_disposal">For Disposal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Client</Label>
                  <Select value={inForm.client_id || 'none'} onValueChange={v => setInForm(f => ({ ...f, client_id: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No client</SelectItem>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>End Customer Ref</Label>
                  <Input value={inForm.end_customer_ref} onChange={e => setInForm(f => ({ ...f, end_customer_ref: e.target.value }))} />
                </div>
                <div>
                  <Label>Inwards Date</Label>
                  <Input type="date" value={inForm.inwards_date} onChange={e => setInForm(f => ({ ...f, inwards_date: e.target.value }))} />
                </div>
                <div>
                  <Label>Qty</Label>
                  <Input type="number" value={inForm.quantity} onChange={e => setInForm(f => ({ ...f, quantity: e.target.value }))} min={1} />
                </div>
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Textarea value={inForm.notes} onChange={e => setInForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2d3e] flex justify-end gap-2">
              <Button variant="outline" onClick={() => setInwardsOpen(false)}>Cancel</Button>
              <Button onClick={handleInwards} disabled={saving || !inForm.description}>
                {saving ? 'Saving...' : 'Log Inwards'}
              </Button>
            </div>
          </div>
        </SlideOver>
      </Dialog>

      {/* Outwards Slide-Over */}
      <Dialog open={outwardsOpen} onOpenChange={setOutwardsOpen}>
        <SlideOver width="max-w-md">
          <div className="flex flex-col h-full">
            <div className="px-6 py-5 border-b border-[#2a2d3e]">
              <DialogTitle>Mark Outwards</DialogTitle>
              <DialogDescription>
                {selectedItem?.description} {selectedItem?.serial_number ? `— S/N: ${selectedItem.serial_number}` : ''}
              </DialogDescription>
            </div>
            <div className="flex-1 px-6 py-5 space-y-4">
              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}
              <div>
                <Label>Outwards Date</Label>
                <Input type="date" value={outForm.outwards_date} onChange={e => setOutForm(f => ({ ...f, outwards_date: e.target.value }))} />
              </div>
              <div>
                <Label>Receiver / Customer</Label>
                <Input value={outForm.receiver} onChange={e => setOutForm(f => ({ ...f, receiver: e.target.value }))} placeholder="Company or person name" />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={outForm.notes} onChange={e => setOutForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[#2a2d3e] flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOutwardsOpen(false)}>Cancel</Button>
              <Button onClick={handleOutwards} disabled={saving}>
                {saving ? 'Saving...' : 'Confirm Outwards'}
              </Button>
            </div>
          </div>
        </SlideOver>
      </Dialog>
    </div>
  )
}
