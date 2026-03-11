'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Cycle {
  id: string
  cycle_name: string | null
  financial_year: string | null
  period_start: string
  period_end: string
  subtotal: number | null
  grand_total: number | null
  gst_amount: number | null
  status: string | null
  total_runup: number | null
  total_delivery: number | null
  total_fuel_surcharge: number | null
  total_install: number | null
  total_storage: number | null
}

interface LineItem {
  id: string
  billing_cycle_id: string
  sheet_type: string
  week_label: string | null
  job_date: string | null
  customer: string | null
  model: string | null
  serial: string | null
  action: string | null
  qty: number | null
  price_ex: number | null
  fuel_surcharge: number | null
  total_ex: number | null
  courier: string | null
  efex_ni: string | null
  notes: string | null
  source_file: string | null
}

const SHEET_LABELS: Record<string, string> = {
  runup: 'Run Up', install: 'Install', delivery: 'Delivery',
  toner: 'Toner', storage: 'Storage', inwards_outwards: 'I/O'
}

const TYPE_COLORS: Record<string, string> = {
  runup: 'bg-blue-500/10 text-blue-400',
  install: 'bg-green-500/10 text-green-400',
  delivery: 'bg-orange-500/10 text-orange-400',
  toner: 'bg-purple-500/10 text-purple-400',
  storage: 'bg-amber-500/10 text-amber-400',
  inwards_outwards: 'bg-cyan-500/10 text-cyan-400',
}

function fmt(n: number) {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fySort(fy: string) {
  // "FY25-26" → 2526 for numeric sort descending
  const m = fy.match(/FY(\d{2})-(\d{2})/)
  return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0
}

export function ArchiveClient({ cycles }: { cycles: Cycle[] }) {
  const [search, setSearch] = useState('')
  const [selectedFY, setSelectedFY] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null)
  const [cycleItems, setCycleItems] = useState<Record<string, LineItem[]>>({})
  const [loadingCycle, setLoadingCycle] = useState<string | null>(null)

  // Derive sorted FY list (newest first)
  const fyList = useMemo(() => {
    const fys = Array.from(new Set(cycles.map(c => c.financial_year ?? 'Unknown')))
    return fys.sort((a, b) => fySort(b) - fySort(a))
  }, [cycles])

  // Filter and sort cycles: newest FY first, newest week first within FY
  const filteredCycles = useMemo(() => {
    return cycles
      .filter(c => {
        const matchFY = selectedFY === 'all' || c.financial_year === selectedFY
        const matchSearch = search === '' || (c.cycle_name ?? '').toLowerCase().includes(search.toLowerCase())
        return matchFY && matchSearch
      })
      .sort((a, b) => {
        // Sort by FY desc, then period_start desc
        const fyA = fySort(a.financial_year ?? '')
        const fyB = fySort(b.financial_year ?? '')
        if (fyB !== fyA) return fyB - fyA
        return (b.period_start ?? '').localeCompare(a.period_start ?? '')
      })
  }, [cycles, selectedFY, search])

  // Summary for selected FY (or all)
  const summarySet = selectedFY === 'all' ? cycles : cycles.filter(c => c.financial_year === selectedFY)
  const totalRevenue = summarySet.reduce((s, c) => s + (c.subtotal ?? 0), 0)
  const totalGST = summarySet.reduce((s, c) => s + (c.gst_amount ?? ((c.grand_total ?? 0) - (c.subtotal ?? 0))), 0)
  const totalGrand = summarySet.reduce((s, c) => s + (c.grand_total ?? 0), 0)

  async function toggleCycle(id: string) {
    if (expandedCycle === id) { setExpandedCycle(null); return }
    setExpandedCycle(id)
    if (cycleItems[id]) return
    setLoadingCycle(id)
    try {
      const r = await fetch(`/api/billing/${id}/line-items`)
      const d = await r.json()
      setCycleItems(prev => ({ ...prev, [id]: d.items ?? [] }))
    } finally {
      setLoadingCycle(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#f1f5f9] p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link href="/billing" className="text-[#94a3b8] hover:text-[#f1f5f9] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Billing Archive</h1>
          <p className="text-sm text-[#94a3b8]">EFEX · {cycles.length} fortnights · {fyList.length} financial years</p>
        </div>
      </div>

      {/* FY Tabs */}
      <div className="flex items-center gap-1 flex-wrap border-b border-[#2a2d3e] mb-5 pb-0">
        <button
          onClick={() => setSelectedFY('all')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            selectedFY === 'all'
              ? 'border-orange-500 text-orange-400'
              : 'border-transparent text-[#64748b] hover:text-[#f1f5f9]'
          )}
        >
          All Years ({cycles.length})
        </button>
        {fyList.map(fy => {
          const count = cycles.filter(c => c.financial_year === fy).length
          return (
            <button
              key={fy}
              onClick={() => setSelectedFY(fy)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                selectedFY === fy
                  ? 'border-orange-500 text-orange-400'
                  : 'border-transparent text-[#64748b] hover:text-[#f1f5f9]'
              )}
            >
              {fy} <span className="opacity-60 text-xs">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Card className="p-4">
          <p className="text-xs text-[#94a3b8] uppercase tracking-wider mb-1">Cycles</p>
          <p className="text-2xl font-bold text-[#f1f5f9]">{summarySet.length}</p>
          <p className="text-xs text-[#64748b] mt-0.5">{selectedFY === 'all' ? `${fyList.length} financial years` : selectedFY}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[#94a3b8] uppercase tracking-wider mb-1">Revenue ex GST</p>
          <p className="text-xl font-bold text-orange-400">${fmt(totalRevenue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[#94a3b8] uppercase tracking-wider mb-1">GST</p>
          <p className="text-xl font-bold text-[#f1f5f9]">${fmt(totalGST)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[#94a3b8] uppercase tracking-wider mb-1">Total inc GST</p>
          <p className="text-xl font-bold text-green-400">${fmt(totalGrand)}</p>
        </Card>
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
        <input
          type="text"
          placeholder="Search weeks…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-[#1a1d27] border border-[#2a2d3e] rounded-lg text-sm text-[#f1f5f9] placeholder-[#64748b] focus:outline-none focus:ring-1 focus:ring-orange-500/50"
        />
      </div>

      {/* Cycles list */}
      <div className="space-y-2">
        {filteredCycles.length === 0 && (
          <p className="text-center text-sm text-[#64748b] py-10">No cycles found.</p>
        )}
        {filteredCycles.map(cycle => {
          const items = cycleItems[cycle.id] ?? []
          const isExpanded = expandedCycle === cycle.id
          const isLoading = loadingCycle === cycle.id

          const period = cycle.period_start && cycle.period_end
            ? `${new Date(cycle.period_start + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} — ${new Date(cycle.period_end + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
            : ''

          return (
            <Card key={cycle.id} className="overflow-hidden">
              <button
                onClick={() => toggleCycle(cycle.id)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#1a1d27] transition-colors text-left"
              >
                {isExpanded
                  ? <ChevronDown className="w-4 h-4 text-[#64748b] flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-[#64748b] flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{cycle.cycle_name}</span>
                    {selectedFY === 'all' && cycle.financial_year && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#1a1d27] border border-[#2a2d3e] text-[#64748b]">
                        {cycle.financial_year}
                      </span>
                    )}
                    <Link
                      href={`/billing/${cycle.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-orange-400 hover:underline"
                    >
                      View →
                    </Link>
                  </div>
                  <p className="text-xs text-[#64748b] mt-0.5">{period}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono text-sm font-semibold text-orange-400">${fmt(cycle.subtotal ?? 0)}</p>
                  <p className="text-xs text-[#64748b]">${fmt(cycle.grand_total ?? 0)} inc GST</p>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-[#2a2d3e]">
                  {/* Breakdown bar */}
                  <div className="px-4 py-2 border-b border-[#2a2d3e] grid grid-cols-3 md:grid-cols-5 gap-3 text-xs">
                    {[
                      { label: 'Run Ups', val: cycle.total_runup },
                      { label: 'Delivery', val: cycle.total_delivery },
                      { label: 'Fuel', val: cycle.total_fuel_surcharge },
                      { label: 'Install', val: cycle.total_install },
                      { label: 'Storage', val: cycle.total_storage },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <p className="text-[#64748b]">{label}</p>
                        <p className="font-mono font-semibold text-[#f1f5f9]">${fmt(val ?? 0)}</p>
                      </div>
                    ))}
                  </div>

                  {isLoading ? (
                    <p className="px-4 py-6 text-center text-sm text-[#64748b]">Loading items…</p>
                  ) : items.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-[#64748b]">No line items stored for this cycle.</p>
                  ) : (
                    <>
                      <div className="px-4 py-2 flex gap-2 flex-wrap border-b border-[#2a2d3e]">
                        {['all', ...Array.from(new Set(items.map(i => i.sheet_type))).sort()].map(t => (
                          <button key={t} onClick={() => setTypeFilter(t)}
                            className={cn('px-2.5 py-0.5 rounded text-xs font-medium transition-colors',
                              typeFilter === t ? 'bg-orange-500/20 text-orange-400' : 'text-[#64748b] hover:text-[#f1f5f9]'
                            )}>
                            {t === 'all' ? `All (${items.length})` : `${SHEET_LABELS[t] ?? t} (${items.filter(i => i.sheet_type === t).length})`}
                          </button>
                        ))}
                      </div>
                      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-[#0f1117]">
                            <tr className="border-b border-[#2a2d3e]">
                              <th className="px-3 py-2 text-left text-[#64748b] uppercase">Type</th>
                              <th className="px-3 py-2 text-left text-[#64748b] uppercase">Date</th>
                              <th className="px-3 py-2 text-left text-[#64748b] uppercase">Customer</th>
                              <th className="px-3 py-2 text-left text-[#64748b] uppercase hidden md:table-cell">Description</th>
                              <th className="px-3 py-2 text-left text-[#64748b] uppercase hidden lg:table-cell">Serial</th>
                              <th className="px-3 py-2 text-right text-[#64748b] uppercase">Qty</th>
                              <th className="px-3 py-2 text-right text-[#64748b] uppercase">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1e2130]">
                            {items
                              .filter(i => typeFilter === 'all' || i.sheet_type === typeFilter)
                              .map(item => (
                                <tr key={item.id} className="hover:bg-[#1a1d27]">
                                  <td className="px-3 py-1.5">
                                    <span className={cn('px-1.5 py-0.5 rounded text-xs', TYPE_COLORS[item.sheet_type] ?? 'bg-[#1a1d27] text-[#94a3b8]')}>
                                      {SHEET_LABELS[item.sheet_type] ?? item.sheet_type}
                                    </span>
                                  </td>
                                  <td className="px-3 py-1.5 text-[#94a3b8] whitespace-nowrap">
                                    {item.job_date ? new Date(item.job_date + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}
                                  </td>
                                  <td className="px-3 py-1.5 text-[#f1f5f9] max-w-[120px] truncate">{item.customer || '—'}</td>
                                  <td className="px-3 py-1.5 text-[#94a3b8] max-w-[180px] truncate hidden md:table-cell">{item.action || item.model || '—'}</td>
                                  <td className="px-3 py-1.5 text-[#64748b] hidden lg:table-cell">{item.serial || item.efex_ni || '—'}</td>
                                  <td className="px-3 py-1.5 text-right text-[#94a3b8]">{item.qty ?? '—'}</td>
                                  <td className="px-3 py-1.5 text-right font-mono font-medium text-[#f1f5f9]">
                                    {item.total_ex != null ? `$${item.total_ex.toFixed(2)}` : '—'}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                          <tfoot className="border-t border-[#2a2d3e]">
                            <tr>
                              <td colSpan={6} className="px-3 py-2 text-right text-xs text-[#64748b]">
                                {typeFilter === 'all' ? items.length : items.filter(i => i.sheet_type === typeFilter).length} items · ex GST
                              </td>
                              <td className="px-3 py-2 text-right text-sm font-bold text-orange-400 font-mono">
                                ${items.filter(i => typeFilter === 'all' || i.sheet_type === typeFilter).reduce((s, i) => s + (i.total_ex ?? 0), 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
