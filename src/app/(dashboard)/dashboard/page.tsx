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
  TrendingUp,
  DollarSign,
  Activity,
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
import { RevenueChart } from '@/components/RevenueChart'

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

function ClientCard({ 
  name, color, openJobs, completedJobs, totalJobs, unbilledCount, latestJobDate 
}: {
  name: string
  color: string
  openJobs: number
  completedJobs: number
  totalJobs: number
  unbilledCount: number
  latestJobDate: string | null
}) {
  const ratio = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0
  const fallbackColor = getClientColor(name)
  const c = color || fallbackColor

  return (
    <Link
      href={`/jobs?client=${name}`}
      className="rounded-xl border bg-[#1e2130] p-5 transition-all hover:border-opacity-70 hover:bg-[#222538] block group"
      style={{ borderColor: `${c}40`, borderLeftWidth: '3px', borderLeftColor: c }}
    >
      {/* Client header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c }} />
        <span className="text-sm font-bold uppercase tracking-wide" style={{ color: c }}>
          {name}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b7280]">Open</p>
          <p className="text-2xl font-bold text-[#f1f5f9] tabular-nums">{openJobs}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b7280]">Completed</p>
          <p className="text-2xl font-bold text-emerald-400 tabular-nums">{completedJobs}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b7280]">Unbilled</p>
          <p className="text-lg font-bold text-amber-400 tabular-nums">{unbilledCount}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6b7280]">Latest</p>
          <p className="text-xs font-medium text-[#94a3b8] mt-1">
            {latestJobDate ? formatDate(latestJobDate) : '—'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#6b7280] uppercase tracking-wider font-semibold">Completion</span>
          <span className="font-bold" style={{ color: c }}>{ratio}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[#0f1117] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${ratio}%`, backgroundColor: c }}
          />
        </div>
      </div>
    </Link>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const todayStr = new Date().toISOString().split('T')[0]
  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString()

  const doneStatuses = ['complete', 'done', 'delivered', 'invoiced']
  const openExclude = ['complete', 'done', 'delivered', 'invoiced', 'cancelled']

  let dashboardError = false

  // Fetch data
  let allJobs: Array<Record<string, unknown>> = []
  let openCycles: Array<Record<string, unknown>> = []
  let recentJobs: Array<Record<string, unknown>> = []

  try {
    const results = await Promise.all([
      supabase
        .from('jobs')
        .select('id, status, scheduled_date, created_at, billing_cycle_id, job_type, archived, clients(id, name, color_code)')
        .neq('job_type', 'toner')
        .eq('archived', false),
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
    allJobs = (results[0].data as Array<Record<string, unknown>>) ?? []
    openCycles = (results[1].data as Array<Record<string, unknown>>) ?? []
    recentJobs = (results[2].data as Array<Record<string, unknown>>) ?? []
  } catch (err) {
    console.error('Dashboard data fetch error:', err)
    dashboardError = true
  }

  // Calculate summary stats
  let totalOpenJobs = 0
  let completedThisWeek = 0
  let unbilledCount = 0
  let inTransitNow = 0
  let newJobsThisWeek = 0
  let readyToBillCount = 0

  const clientStats: Record<string, {
    name: string; color: string; openJobs: number; completedJobs: number;
    totalJobs: number; unbilledCount: number; latestJobDate: string | null
  }> = {}

  for (const clientName of BILLING_CLIENTS) {
    clientStats[clientName] = {
      name: clientName, color: '', openJobs: 0, completedJobs: 0,
      totalJobs: 0, unbilledCount: 0, latestJobDate: null,
    }
  }

  for (const job of allJobs) {
    const status = ((job.status as string) ?? 'new').toLowerCase()
    const cl = job.clients as { name: string; color_code?: string | null } | null
    const clientName = cl?.name
    const clientColor = cl?.color_code
    const createdAt = job.created_at as string | null
    const scheduledDate = job.scheduled_date as string | null

    if (!openExclude.includes(status)) totalOpenJobs++
    if (status === 'in_transit' || status === 'dispatched') inTransitNow++
    if (doneStatuses.includes(status) && createdAt && createdAt >= sevenDaysAgoStr) completedThisWeek++
    if (createdAt && createdAt >= sevenDaysAgoStr) newJobsThisWeek++
    if (!job.billing_cycle_id && doneStatuses.includes(status) && status !== 'invoiced') unbilledCount++
    if (!job.billing_cycle_id && status !== 'cancelled') readyToBillCount++

    if (clientName && clientStats[clientName]) {
      const cs = clientStats[clientName]
      if (clientColor) cs.color = clientColor as string
      cs.totalJobs++
      if (!openExclude.includes(status)) cs.openJobs++
      if (doneStatuses.includes(status)) cs.completedJobs++
      if (!job.billing_cycle_id && status !== 'cancelled') cs.unbilledCount++
      const jobDate = scheduledDate || createdAt
      if (jobDate && (!cs.latestJobDate || jobDate > cs.latestJobDate)) cs.latestJobDate = jobDate
    }
  }

  const openBillingTotal = openCycles.reduce(
    (sum, c) => sum + ((c.grand_total as number) ?? 0), 0
  )

  const today = new Date()
  const formattedDate = today.toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
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

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Jobs"
          value={totalOpenJobs}
          icon={Briefcase}
          iconColor="text-blue-400"
          accent
        />
        <StatCard
          label="Completed This Week"
          value={completedThisWeek}
          icon={CheckCircle2}
          iconColor="text-emerald-400"
        />
        <StatCard
          label="Unbilled Jobs"
          value={unbilledCount}
          icon={DollarSign}
          iconColor="text-amber-400"
          sub={`${readyToBillCount} total ready`}
        />
        <StatCard
          label="In Transit Now"
          value={inTransitNow}
          icon={Truck}
          iconColor="text-green-400"
        />
      </div>

      {/* Per-Client Cards */}
      <div>
        <h2 className="text-base font-semibold text-[#f1f5f9] mb-3">By Client</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {BILLING_CLIENTS.map((clientName) => {
            const cs = clientStats[clientName]
            return (
              <ClientCard
                key={clientName}
                name={cs.name}
                color={cs.color}
                openJobs={cs.openJobs}
                completedJobs={cs.completedJobs}
                totalJobs={cs.totalJobs}
                unbilledCount={cs.unbilledCount}
                latestJobDate={cs.latestJobDate}
              />
            )
          })}
        </div>
      </div>

      {/* Last 7 Days Summary */}
      <div className="rounded-xl border border-[#2a2d3e] bg-[#1e2130] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-[#f97316]" />
          <h2 className="text-base font-semibold text-[#f1f5f9]">Last 7 Days</h2>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Jobs Completed</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1 tabular-nums">{completedThisWeek}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">New Jobs Received</p>
            <p className="text-2xl font-bold text-blue-400 mt-1 tabular-nums">{newJobsThisWeek}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Ready to Bill</p>
            <p className="text-2xl font-bold text-amber-400 mt-1 tabular-nums">{unbilledCount}</p>
            <p className="text-xs text-[#94a3b8] mt-0.5">unbilled completed jobs</p>
          </div>
        </div>
      </div>

      {/* Open Billing Cycles */}
      {openCycles.length > 0 && (() => {
        const clientCycleMap: Record<string, {
          cycle_name: string | null; grand_total: number;
          period_start: string | null; period_end: string | null; color_code: string | null
        }> = {}

        for (const c of openCycles) {
          const cl = c.clients as { name: string; color_code?: string | null } | null
          if (!cl?.name) continue
          if (!clientCycleMap[cl.name]) {
            clientCycleMap[cl.name] = {
              cycle_name: c.cycle_name as string | null,
              grand_total: (c.grand_total as number) ?? 0,
              period_start: c.period_start as string | null,
              period_end: c.period_end as string | null,
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
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs font-bold uppercase tracking-wide" style={{ color }}>{clientName}</span>
                    </div>
                    <p className="text-sm font-semibold text-[#f1f5f9] truncate mb-1">
                      {cycle?.cycle_name ?? 'No open cycle'}
                    </p>
                    <p className="text-xl font-bold tabular-nums" style={{ color: cycle ? color : '#64748b' }}>
                      {cycle ? formatCurrency(cycle.grand_total) : '$0.00'}
                    </p>
                    {daysInCycle !== null && <p className="text-xs text-[#94a3b8] mt-1">{daysInCycle} day cycle</p>}
                    {!cycle && <p className="text-xs text-[#64748b] mt-1">No active cycle</p>}
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Revenue Chart */}
      <Card className="p-5">
        <h2 className="text-base font-semibold text-[#f1f5f9] mb-4">Revenue by Client</h2>
        <RevenueChart />
      </Card>

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
            <CalendarCheck className="w-4 h-4" />
            Calendar
          </Link>
        </Button>
      </div>
    </div>
  )
}
