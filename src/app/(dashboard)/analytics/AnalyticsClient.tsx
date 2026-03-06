'use client'

import { formatCurrency } from '@/lib/utils'

interface Props {
  fyRevenue: number
  thisMonthRevenue: number
  fyJobCount: number
  activeInventory: number
  revenueByMonth: { month: string; total: number }[]
  jobsByType: Record<string, number>
  jobsByStatus: Record<string, number>
  topClients: { name: string; total: number }[]
}

const typeLabels: Record<string, string> = {
  runup: 'Run Up', install: 'Install', delivery: 'Delivery', collection: 'Collection',
  warehouse: 'Warehouse', inwards: 'Inwards', outwards: 'Outwards',
  toner_ship: 'Toner Ship', storage: 'Storage',
}

const typeColors: Record<string, string> = {
  runup: '#3b82f6', install: '#a855f7', delivery: '#f97316', collection: '#eab308',
  warehouse: '#22c55e', inwards: '#14b8a6', outwards: '#06b6d4',
  toner_ship: '#ec4899', storage: '#64748b',
}

const statusLabels: Record<string, string> = {
  new: 'New', runup_pending: 'Run Up Pending', runup_complete: 'Run Up Complete',
  ready: 'Ready', dispatched: 'Dispatched', in_transit: 'In Transit',
  complete: 'Complete', invoiced: 'Invoiced', cancelled: 'Cancelled',
}

export default function AnalyticsClient({
  fyRevenue, thisMonthRevenue, fyJobCount, activeInventory,
  revenueByMonth, jobsByType, jobsByStatus, topClients,
}: Props) {
  const maxRevenue = Math.max(...revenueByMonth.map((m) => m.total), 1)

  // Pie chart data
  const typeEntries = Object.entries(jobsByType).sort((a, b) => b[1] - a[1])
  const totalJobs = typeEntries.reduce((s, [, v]) => s + v, 0)

  // Build pie slices
  let pieAngle = 0
  const pieSlices = typeEntries.map(([type, count]) => {
    const pct = count / (totalJobs || 1)
    const startAngle = pieAngle
    pieAngle += pct * 360
    return { type, count, pct, startAngle, endAngle: pieAngle }
  })

  function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
    const s = polarToCartesian(cx, cy, r, start)
    const e = polarToCartesian(cx, cy, r, end)
    const large = end - start > 180 ? 1 : 0
    return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`
  }

  // Status bars
  const statusEntries = Object.entries(jobsByStatus).sort((a, b) => b[1] - a[1])
  const maxStatus = Math.max(...statusEntries.map(([, v]) => v), 1)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-[#f1f5f9]">📊 Analytics</h1>

      {/* A. Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="FY Revenue" value={formatCurrency(fyRevenue)} />
        <StatCard label="This Month" value={formatCurrency(thisMonthRevenue)} />
        <StatCard label="FY Jobs" value={String(fyJobCount)} />
        <StatCard label="Active Inventory" value={String(activeInventory)} />
      </div>

      {/* B. Revenue by Month */}
      <div className="bg-[#1e2130] rounded-xl border border-[#2a2d3e] p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-[#f1f5f9] mb-4">Revenue by Month (Last 12)</h2>
        <div className="flex items-end gap-1 sm:gap-2 h-48">
          {revenueByMonth.map((m) => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-[#94a3b8] font-mono">
                {m.total > 0 ? `$${(m.total / 1000).toFixed(0)}k` : ''}
              </span>
              <div
                className="w-full bg-orange-500 rounded-t transition-all"
                style={{ height: `${Math.max((m.total / maxRevenue) * 160, m.total > 0 ? 4 : 0)}px` }}
              />
              <span className="text-[9px] text-[#64748b] truncate w-full text-center">{m.month}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* C. Jobs by Type (Pie) */}
        <div className="bg-[#1e2130] rounded-xl border border-[#2a2d3e] p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-[#f1f5f9] mb-4">Jobs by Type</h2>
          <div className="flex items-center gap-6">
            <svg viewBox="0 0 200 200" className="w-32 h-32 sm:w-40 sm:h-40 shrink-0">
              {pieSlices.length === 1 ? (
                <circle cx="100" cy="100" r="90" fill={typeColors[pieSlices[0].type] ?? '#64748b'} />
              ) : (
                pieSlices.map((s) => (
                  <path
                    key={s.type}
                    d={arcPath(100, 100, 90, s.startAngle, s.endAngle - 0.5)}
                    fill={typeColors[s.type] ?? '#64748b'}
                  />
                ))
              )}
              <circle cx="100" cy="100" r="50" fill="#1e2130" />
              <text x="100" y="95" textAnchor="middle" fill="#f1f5f9" fontSize="24" fontWeight="bold">
                {totalJobs}
              </text>
              <text x="100" y="115" textAnchor="middle" fill="#94a3b8" fontSize="11">
                total
              </text>
            </svg>
            <div className="space-y-1.5 text-xs">
              {typeEntries.map(([type, count]) => (
                <div key={type} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: typeColors[type] ?? '#64748b' }}
                  />
                  <span className="text-[#94a3b8]">{typeLabels[type] ?? type}</span>
                  <span className="text-[#f1f5f9] font-medium ml-auto">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* D. Jobs by Status this month */}
        <div className="bg-[#1e2130] rounded-xl border border-[#2a2d3e] p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-[#f1f5f9] mb-4">Jobs by Status (This Month)</h2>
          {statusEntries.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">No jobs this month</p>
          ) : (
            <div className="space-y-2">
              {statusEntries.map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs text-[#94a3b8] w-28 shrink-0 truncate">
                    {statusLabels[status] ?? status.replace(/_/g, ' ')}
                  </span>
                  <div className="flex-1 h-5 bg-[#0f1117] rounded overflow-hidden">
                    <div
                      className="h-full bg-orange-500 rounded transition-all"
                      style={{ width: `${(count / maxStatus) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-[#f1f5f9] w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* E. Top Clients */}
      <div className="bg-[#1e2130] rounded-xl border border-[#2a2d3e] p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-[#f1f5f9] mb-4">Top Clients (This FY)</h2>
        {topClients.length === 0 ? (
          <p className="text-sm text-[#94a3b8]">No billing data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2d3e]">
                  <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">#</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[#94a3b8] uppercase">Client</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-[#94a3b8] uppercase">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2d3e]">
                {topClients.map((c, i) => (
                  <tr key={c.name} className="hover:bg-[#1a1d27]">
                    <td className="px-4 py-2 text-[#94a3b8]">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-[#f1f5f9]">{c.name}</td>
                    <td className="px-4 py-2 text-right font-semibold text-orange-400 font-mono">{formatCurrency(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1e2130] rounded-xl border border-[#2a2d3e] p-4">
      <p className="text-xs text-[#94a3b8] font-medium">{label}</p>
      <p className="text-xl font-bold text-[#f1f5f9] mt-1 font-mono">{value}</p>
    </div>
  )
}
