'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Copy, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn, formatCurrency } from '@/lib/utils'

interface PricingRule {
  id: string
  financial_year: string
  job_type: string
  machine_type: string | null
  line_item_name: string
  unit_price: number
  unit: string | null
  fuel_applicable: boolean | null
  is_active: boolean | null
}

interface Props {
  initialRules: PricingRule[]
  allYears: string[]
}

const JOB_TYPES = ['runup', 'install', 'delivery', 'collection', 'storage', 'toner', 'inwards', 'outwards', 'misc']
const MACHINE_TYPES = ['A4_SFP', 'A4_MFD', 'A3', 'FINISHER', 'FIN_ACCESSORIES', 'OTHER']

export default function PricingEditor({ initialRules, allYears }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [selectedFY, setSelectedFY] = useState(allYears[0] ?? '2025-2026')
  const [rules, setRules] = useState<PricingRule[]>(initialRules)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<PricingRule>>({})
  const [showAddRow, setShowAddRow] = useState(false)
  const [newRule, setNewRule] = useState<Partial<PricingRule>>({
    financial_year: selectedFY,
    job_type: 'runup',
    machine_type: null,
    line_item_name: '',
    unit_price: 0,
    unit: 'per job',
    fuel_applicable: false,
  })
  const [copyFYFrom, setCopyFYFrom] = useState('')
  const [copyFYTo, setCopyFYTo] = useState('')
  const [copying, setCopying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState('')

  const filtered = rules.filter(r => r.financial_year === selectedFY)

  async function fetchRules(fy: string) {
    const res = await fetch(`/api/settings/pricing?fy=${fy}`)
    const json = await res.json()
    if (res.ok) {
      setRules(prev => [...prev.filter(r => r.financial_year !== fy), ...(json.data ?? [])])
    }
  }

  async function handleFYChange(fy: string) {
    setSelectedFY(fy)
    setNewRule(n => ({ ...n, financial_year: fy }))
    fetchRules(fy)
  }

  function startEdit(rule: PricingRule) {
    setEditingId(rule.id)
    setEditValues({ ...rule })
  }

  async function saveEdit() {
    if (!editingId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/settings/pricing/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editValues),
      })
      const json = await res.json()
      if (res.ok) {
        setRules(prev => prev.map(r => r.id === editingId ? { ...r, ...editValues } : r))
        setEditingId(null)
        setEditValues({})
      } else {
        setError(json.error || 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await fetch(`/api/settings/pricing/${id}`, { method: 'DELETE' })
      setRules(prev => prev.filter(r => r.id !== id))
      setConfirmDelete(null)
    } finally {
      setDeleting(null)
    }
  }

  async function handleAdd() {
    if (!newRule.line_item_name || newRule.unit_price === undefined) {
      setError('Line item name and unit price required'); return
    }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/settings/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newRule, financial_year: selectedFY }),
      })
      const json = await res.json()
      if (res.ok) {
        setRules(prev => [...prev, json.data])
        setShowAddRow(false)
        setNewRule({ financial_year: selectedFY, job_type: 'runup', machine_type: null, line_item_name: '', unit_price: 0, unit: 'per job', fuel_applicable: false })
      } else {
        setError(json.error || 'Failed to add rule')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleCopyFY() {
    if (!copyFYFrom || !copyFYTo) { setError('Select source and target FY'); return }
    if (copyFYFrom === copyFYTo) { setError('Source and target FY must differ'); return }
    setCopying(true); setError('')
    try {
      const fromRules = rules.filter(r => r.financial_year === copyFYFrom)
      if (fromRules.length === 0) {
        // Load them first
        const res = await fetch(`/api/settings/pricing?fy=${copyFYFrom}`)
        const json = await res.json()
        if (!res.ok || !json.data?.length) { setError('No rules found in source FY'); return }
        const toInsert = json.data.map((r: PricingRule) => ({
          financial_year: copyFYTo,
          job_type: r.job_type,
          machine_type: r.machine_type,
          line_item_name: r.line_item_name,
          unit_price: r.unit_price,
          unit: r.unit,
          fuel_applicable: r.fuel_applicable,
        }))
        for (const rule of toInsert) {
          await fetch('/api/settings/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rule),
          })
        }
      } else {
        const toInsert = fromRules.map(r => ({
          financial_year: copyFYTo,
          job_type: r.job_type,
          machine_type: r.machine_type,
          line_item_name: r.line_item_name,
          unit_price: r.unit_price,
          unit: r.unit,
          fuel_applicable: r.fuel_applicable,
        }))
        for (const rule of toInsert) {
          await fetch('/api/settings/pricing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rule),
          })
        }
      }
      setCopyFYFrom(''); setCopyFYTo('')
      // Switch to the new FY
      setSelectedFY(copyFYTo)
      await fetchRules(copyFYTo)
      startTransition(() => router.refresh())
    } finally {
      setCopying(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* FY Selector + Copy */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedFY} onValueChange={handleFYChange}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {allYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            <SelectItem value="2026-2027">2026-2027</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" onClick={() => setShowAddRow(v => !v)} variant="outline">
          <Plus className="w-3.5 h-3.5" />
          Add Rule
        </Button>

        {/* Copy FY */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-[#94a3b8]">Copy FY:</span>
          <Select value={copyFYFrom} onValueChange={setCopyFYFrom}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="From" /></SelectTrigger>
            <SelectContent>
              {allYears.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-[#94a3b8]">→</span>
          <Input
            value={copyFYTo}
            onChange={e => setCopyFYTo(e.target.value)}
            placeholder="2026-2027"
            className="w-28 h-8 text-xs"
          />
          <Button size="sm" variant="secondary" onClick={handleCopyFY} disabled={copying}>
            <Copy className="w-3.5 h-3.5" />
            {copying ? 'Copying...' : 'Copy'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-[#2a2d3e]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a2d3e] bg-[#1a1d27]">
              <th className="px-3 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Job Type</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Line Item Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase hidden sm:table-cell">Machine Type</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Unit Price</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase hidden md:table-cell">Unit</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-[#94a3b8] uppercase hidden md:table-cell">Fuel?</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-[#94a3b8] uppercase">Active</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2d3e]">
            {/* Add row at top */}
            {showAddRow && (
              <tr className="bg-orange-500/5 border-b border-orange-500/20">
                <td className="px-3 py-2">
                  <Select value={newRule.job_type} onValueChange={v => setNewRule(n => ({ ...n, job_type: v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{JOB_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input value={newRule.line_item_name} onChange={e => setNewRule(n => ({ ...n, line_item_name: e.target.value }))} className="h-7 text-xs" placeholder="Line item name" />
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <Select value={newRule.machine_type ?? 'none'} onValueChange={v => setNewRule(n => ({ ...n, machine_type: v === 'none' ? null : v }))}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any</SelectItem>
                      {MACHINE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input type="number" step="0.01" value={newRule.unit_price ?? 0} onChange={e => setNewRule(n => ({ ...n, unit_price: parseFloat(e.target.value) || 0 }))} className="h-7 text-xs text-right w-24" />
                </td>
                <td className="px-3 py-2 hidden md:table-cell">
                  <Input value={newRule.unit ?? ''} onChange={e => setNewRule(n => ({ ...n, unit: e.target.value }))} className="h-7 text-xs w-24" placeholder="per job" />
                </td>
                <td className="px-3 py-2 text-center hidden md:table-cell">
                  <input type="checkbox" checked={newRule.fuel_applicable ?? false} onChange={e => setNewRule(n => ({ ...n, fuel_applicable: e.target.checked }))} className="accent-orange-500" />
                </td>
                <td className="px-3 py-2 text-center"></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button onClick={handleAdd} disabled={saving} className="text-green-400 hover:text-green-300 p-1">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowAddRow(false)} className="text-[#94a3b8] hover:text-red-400 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {filtered.length === 0 && !showAddRow && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-[#94a3b8]">
                  No pricing rules for {selectedFY}. Add one above or copy from another FY.
                </td>
              </tr>
            )}

            {filtered.map(rule => {
              const isEditing = editingId === rule.id
              const isConfirmDelete = confirmDelete === rule.id

              return (
                <tr key={rule.id} className={cn('hover:bg-[#1a1d27] transition-colors', isEditing && 'bg-orange-500/5')}>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <Select value={editValues.job_type} onValueChange={v => setEditValues(e => ({ ...e, job_type: v }))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{JOB_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[#2a2d3e] text-[#94a3b8] capitalize">{rule.job_type}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-[#f1f5f9] text-xs">
                    {isEditing ? (
                      <Input value={editValues.line_item_name ?? ''} onChange={e => setEditValues(ev => ({ ...ev, line_item_name: e.target.value }))} className="h-7 text-xs" />
                    ) : (
                      <span className="cursor-pointer" onClick={() => startEdit(rule)}>{rule.line_item_name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell text-xs text-[#94a3b8]">
                    {isEditing ? (
                      <Select value={editValues.machine_type ?? 'none'} onValueChange={v => setEditValues(e => ({ ...e, machine_type: v === 'none' ? null : v }))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Any" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Any</SelectItem>
                          {MACHINE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (rule.machine_type ?? '—')}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {isEditing ? (
                      <Input type="number" step="0.01" value={editValues.unit_price ?? 0} onChange={e => setEditValues(ev => ({ ...ev, unit_price: parseFloat(e.target.value) || 0 }))} className="h-7 text-xs text-right w-24 ml-auto" />
                    ) : (
                      <span className="text-[#f1f5f9] text-xs cursor-pointer" onClick={() => startEdit(rule)}>{formatCurrency(rule.unit_price)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell text-xs text-[#94a3b8]">
                    {isEditing ? (
                      <Input value={editValues.unit ?? ''} onChange={e => setEditValues(ev => ({ ...ev, unit: e.target.value }))} className="h-7 text-xs w-24" />
                    ) : (rule.unit ?? '—')}
                  </td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">
                    {isEditing ? (
                      <input type="checkbox" checked={editValues.fuel_applicable ?? false} onChange={e => setEditValues(ev => ({ ...ev, fuel_applicable: e.target.checked }))} className="accent-orange-500" />
                    ) : (
                      rule.fuel_applicable
                        ? <span className="text-xs text-orange-400">+11%</span>
                        : <span className="text-xs text-[#64748b]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {isEditing ? (
                      <input type="checkbox" checked={editValues.is_active ?? true} onChange={e => setEditValues(ev => ({ ...ev, is_active: e.target.checked }))} className="accent-orange-500" />
                    ) : (
                      <span className={cn('text-xs', rule.is_active ? 'text-green-400' : 'text-[#64748b]')}>
                        {rule.is_active ? '✓' : '✗'}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="flex gap-1">
                        <button onClick={saveEdit} disabled={saving} className="text-green-400 hover:text-green-300 p-1">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setEditingId(null); setEditValues({}) }} className="text-[#94a3b8] hover:text-[#f1f5f9] p-1">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : isConfirmDelete ? (
                      <div className="flex gap-1 items-center">
                        <span className="text-xs text-red-400">Sure?</span>
                        <button onClick={() => handleDelete(rule.id)} disabled={deleting === rule.id} className="text-red-400 hover:text-red-300 p-1">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setConfirmDelete(null)} className="text-[#94a3b8] p-1">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <button onClick={() => startEdit(rule)} className="text-[#94a3b8] hover:text-[#f1f5f9] p-1 text-xs">Edit</button>
                        <button onClick={() => setConfirmDelete(rule.id)} className="text-[#94a3b8] hover:text-red-400 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#94a3b8]">Click any cell to edit inline. Press ✓ to save or ✗ to cancel.</p>
    </div>
  )
}
