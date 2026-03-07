import Link from 'next/link'
import {
  Briefcase,
  Clock,
  Receipt,
  Package,
  Truck,
  Plus,
  ArrowRight,
  CheckCircle2,
  CalendarCheck,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { formatDate, jobTypeLabel, formatCurrency } from '@/lib/utils'
import { getClientColor, BILLING_CLIENTS } from '@/lib/client-colors'

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  iconColor: string
  accent?: boolean
  sub?: string
}

function StatCard({ label, value, icon: Icon, iconColor, accent, sub }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? 'border-orange-500/30 bg-orange-500/5' : 'border-[#2a2d3e] bg-[#1e2130]'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#94a3b8]">{label}</p>
          <p className="text-3xl font-bold text-[#f1f5f9] mt-1 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-[#94a3b8] mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconColor.replace('text-', 'bg-').replace(/-(4|5)00/, '-500/15')}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={2} />
        </div>
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const todayStr = new Date().toISOString().split('T')[0]

  // H4: Wrap Promise.all in try-catch so a single query failure doesn't crash the dashboard
  let openJobs: number | null = 0
  let pendingRunups: number | null = 0
  let dispatchedToday: number | null = 0
  let stockOnHand: number | null = 0
  let openCycles: Array<Record<string, unknown>> | null = []
  let recentJobs: Array<Record<string, unknown>> | null = []
  let dashboardError = false

  try {
    const results = await Promise.all([
      supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .not('status', 'in', '(complete,invoiced,cancelled)'),
      supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'runup_pending'),
      supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'dispatched')
        .eq('scheduled_date', todayStr),
      supabase
        .from('inventory')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      supabase
        .from('billing_cycles')
        .select('grand_total, period_start, period_end, cycle_name, clients(id, name, color_code)')
        .eq('status', 'open'),
      supabase
        .from('jobs')
        .select('*, clients(name), end_customers(name), staff:assigned_to(name)')
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    openJobs = results[0].count
    pendingRunups = results[1].count
    dispatchedToday = results[2].count
    stockOnHand = results[3].count
    openCycles = results[4].data as Array<Record<string, unknown>> | null
    recentJobs = results[5].data as Array<Record<string, unknown>> | null
  } catch (err) {
    console.error('Dashboard data fetch error:', err)
    dashboardError = true
  }

  const openBillingTotal = openCycles?.reduce(
    (sum: number, c: Record<string, unknown>) => sum + ((c.grand_total as number) ?? 0),
    0
  ) ?? 0

  const today = new Date()
  const formattedDate = today.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="p-6 space-y-6">
      {dashboardError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          Some dashboard data failed to load. Refresh the page to retry.
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">Dashboard</h1>
          <p className="text-sm text-[#94a3b8] mt-0.5">{formattedDate}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href="/billing">
              <Receipt className="w-4 h-4" />
              Close Billing
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/jobs?new=1">
              <Plus className="w-4 h-4" />
              New Job
            </Link>
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Open Jobs"
          value={openJobs ?? 0}
          icon={Briefcase}
          iconColor="text-blue-400"
          accent
        />
        <StatCard
          label="Pending Run-Ups"
          value={pendingRunups ?? 0}
          icon={Clock}
          iconColor="text-amber-400"
        />
        <StatCard
          label="Dispatched Today"
          value={dispatchedToday ?? 0}
          icon={CalendarCheck}
          iconColor="text-green-400"
        />
        <StatCard
          label="Open Billing"
          value={formatCurrency(openBillingTotal)}
          icon={Receipt}
          iconColor="text-purple-400"
          sub={`${openCycles?.length ?? 0} cycle${(openCycles?.length ?? 0) !== 1 ? 's' : ''}`}
        />
        <StatCard
          label="SOH Units"
          value={stockOnHand ?? 0}
          icon={Package}
          iconColor="text-cyan-400"
        />
      </div>

      {/* Open Billing Cycles — one card per billing client */}
      {openCycles && openCycles.length > 0 && (() => {
        // Build a map: clientName → best open cycle (latest)
        const clientCycleMap: Record<string, {
          cycle_name: string | null
          grand_total: number
          period_start: string | null
          period_end: string | null
          color_code: string | null
        }> = {}

        for (const c of openCycles) {
          const cl = (c as Record<string, unknown>).clients as { name: string; color_code?: string | null } | null
          if (!cl?.name) continue
          if (!clientCycleMap[cl.name]) {
            clientCycleMap[cl.name] = {
              cycle_name: (c as Record<string, unknown>).cycle_name as string | null,
              grand_total: ((c as Record<string, unknown>).grand_total as number) ?? 0,
              period_start: (c as Record<string, unknown>).period_start as string | null,
              period_end: (c as Record<string, unknown>).period_end as string | null,
              color_code: cl.color_code ?? null,
            }
          }
        }

        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-[#f1f5f9]">Open Billing Cycles</h2>
              <Link href="/billing?status=open" className="text-sm text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 transition">
                View all <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {BILLING_CLIENTS.map((clientName) => {
                const cycle = clientCycleMap[clientName]
                const color = getClientColor(clientName, cycle?.color_code)

                // Days in cycle
                let daysInCycle: number | null = null
                if (cycle?.period_start && cycle?.period_end) {
                  const start = new Date(cycle.period_start)
                  const end = new Date(cycle.period_end)
                  daysInCycle = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
                }

                return (
                  <Link
                    key={clientName}
                    href={`/billing?status=open&client=${clientName}`}
                    className="rounded-xl border bg-[#1e2130] p-4 transition-all hover:border-opacity-70 hover:bg-[#222538] block"
                    style={{ borderColor: `${color}50`, borderLeftWidth: '3px', borderLeftColor: color }}
                  >
                    {/* Client name with dot */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>
                        {clientName}
                      </span>
                    </div>

                    {/* Cycle name or placeholder */}
                    <p className="text-sm font-semibold text-[#f1f5f9] truncate mb-1">
                      {cycle?.cycle_name ?? 'No open cycle'}
                    </p>

                    {/* Grand total */}
                    <p className="text-xl font-bold tabular-nums" style={{ color: cycle ? color : '#64748b' }}>
                      {cycle ? formatCurrency(cycle.grand_total) : '$0.00'}
                    </p>

                    {/* Days in cycle */}
                    {daysInCycle !== null && (
                      <p className="text-xs text-[#94a3b8] mt-1">{daysInCycle} day cycle</p>
                    )}
                    {!cycle && (
                      <p className="text-xs text-[#64748b] mt-1">No active cycle</p>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Recent Jobs */}
      <Card>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2d3e]">
          <h2 className="text-base font-semibold text-[#f1f5f9]">Recent Jobs</h2>
          <Link
            href="/jobs"
            className="text-sm text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1 transition"
          >
            View all
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentJobs && recentJobs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Assigned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentJobs.map((job) => (
                <TableRow key={String(job.id)}>
                  <TableCell>
                    <Link
                      href={`/jobs?job=${job.id}`}
                      className="font-mono font-medium text-orange-400 hover:text-orange-300 transition"
                    >
                      #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
                    </Link>
                  </TableCell>
                  <TableCell className="text-[#94a3b8]">
                    {jobTypeLabel(String(job.job_type ?? ''))}
                  </TableCell>
                  <TableCell className="font-medium text-[#f1f5f9]">
                    {(job.clients as Record<string, unknown> | null)?.name as string ?? '—'}
                  </TableCell>
                  <TableCell className="text-[#94a3b8]">
                    {(job.end_customers as Record<string, unknown> | null)?.name as string ?? '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={String(job.status ?? '')} />
                  </TableCell>
                  <TableCell className="text-[#94a3b8]">
                    {formatDate(job.scheduled_date as string | null)}
                  </TableCell>
                  <TableCell className="text-[#94a3b8]">
                    {(job.staff as Record<string, unknown> | null)?.name as string ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-center gap-3">
              <Truck className="w-12 h-12 text-[#2a2d3e]" strokeWidth={1.5} />
              <div>
                <p className="font-semibold text-[#f1f5f9]">No jobs yet</p>
                <p className="text-sm text-[#94a3b8] mt-0.5">Jobs will appear here once created.</p>
              </div>
              <Button size="sm" asChild className="mt-1">
                <Link href="/jobs?new=1">
                  <Plus className="w-4 h-4" />
                  Create new job
                </Link>
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Quick Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <Link href="/jobs?new=1">
            <Truck className="w-4 h-4" />
            New Run-Up
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/billing">
            <Receipt className="w-4 h-4" />
            Close Billing Cycle
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/inventory">
            <Package className="w-4 h-4" />
            View Inventory
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/calendar">
            <CheckCircle2 className="w-4 h-4" />
            Calendar
          </Link>
        </Button>
      </div>
    </div>
  )
}
