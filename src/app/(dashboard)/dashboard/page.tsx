import Link from 'next/link'
import {
  Briefcase,
  Clock,
  Receipt,
  Package,
  Truck,
  Plus,
  ArrowRight,
  PackagePlus,
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
import { formatDate, jobTypeLabel } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: number
  icon: React.ElementType
  iconBg: string
  iconColor: string
  bg?: string
}

function StatCard({ label, value, icon: Icon, iconBg, iconColor, bg = 'bg-white' }: StatCardProps) {
  return (
    <div className={`rounded-xl border border-slate-200 ${bg} shadow-sm p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{value.toLocaleString()}</p>
        </div>
        <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={2} />
        </div>
      </div>
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { count: totalJobs },
    { count: pendingRunups },
    { count: openBilling },
    { count: stockOnHand },
    { data: recentJobs },
  ] = await Promise.all([
    supabase.from('jobs').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'runup_pending'),
    supabase.from('billing_cycles').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('jobs').select('*, clients(name)').order('created_at', { ascending: false }).limit(10),
  ])

  const today = new Date()
  const formattedDate = today.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">{formattedDate}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href="/inventory/inwards">
              <PackagePlus className="w-4 h-4" />
              Log Inwards
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/jobs/new">
              <Plus className="w-4 h-4" />
              New Job
            </Link>
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Jobs"
          value={totalJobs ?? 0}
          icon={Briefcase}
          iconBg="bg-slate-100"
          iconColor="text-slate-600"
        />
        <StatCard
          label="Pending Run-Ups"
          value={pendingRunups ?? 0}
          icon={Clock}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
          bg="bg-amber-50"
        />
        <StatCard
          label="Open Billing"
          value={openBilling ?? 0}
          icon={Receipt}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          label="Stock on Hand"
          value={stockOnHand ?? 0}
          icon={Package}
          iconBg="bg-green-100"
          iconColor="text-green-600"
          bg="bg-green-50"
        />
      </div>

      {/* Recent Jobs */}
      <Card>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Recent Jobs</h2>
          <Link
            href="/jobs"
            className="text-sm text-orange-500 hover:text-orange-600 font-medium flex items-center gap-1"
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
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentJobs.map((job: Record<string, unknown>) => (
                <TableRow key={String(job.id)}>
                  <TableCell>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-mono font-medium text-orange-600 hover:text-orange-700"
                    >
                      #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
                    </Link>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {jobTypeLabel(String(job.job_type ?? ''))}
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {(job.clients as Record<string, unknown> | null)?.name as string ?? '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={String(job.status ?? '')} />
                  </TableCell>
                  <TableCell className="text-slate-500">
                    {formatDate(job.scheduled_date as string | null)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="py-16">
            <div className="flex flex-col items-center text-center gap-3">
              <Truck className="w-12 h-12 text-slate-300" strokeWidth={1.5} />
              <div>
                <p className="font-semibold text-slate-700">No jobs yet</p>
                <p className="text-sm text-slate-400 mt-0.5">Jobs will appear here once created.</p>
              </div>
              <Button size="sm" asChild className="mt-1">
                <Link href="/jobs/new">
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
          <Link href="/toner/new">
            <Receipt className="w-4 h-4" />
            New Toner Order
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/billing/new">
            <Receipt className="w-4 h-4" />
            New Billing Cycle
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/inventory">
            <Package className="w-4 h-4" />
            View Inventory
          </Link>
        </Button>
      </div>
    </div>
  )
}
