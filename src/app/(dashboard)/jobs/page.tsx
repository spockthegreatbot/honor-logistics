import Link from 'next/link'
import { Package, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { formatDate, jobTypeLabel } from '@/lib/utils'

export default async function JobsPage() {
  const supabase = await createClient()

  const { data: jobs, count } = await supabase
    .from('jobs')
    .select('*, clients(name)', { count: 'exact' })
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
          {count != null && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {count}
            </span>
          )}
        </div>
        <Button size="sm" asChild>
          <Link href="/jobs/new">
            <Plus className="w-4 h-4" />
            New Job
          </Link>
        </Button>
      </div>

      {/* Table or empty state */}
      <Card>
        {jobs && jobs.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job: Record<string, unknown>) => (
                <TableRow key={String(job.id)}>
                  <TableCell>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-mono font-semibold text-orange-600 hover:text-orange-700"
                    >
                      #{String(job.job_number ?? job.id).slice(-6).toUpperCase()}
                    </Link>
                  </TableCell>
                  <TableCell>{jobTypeLabel(String(job.job_type ?? ''))}</TableCell>
                  <TableCell>
                    <StatusBadge status={String(job.status ?? '')} />
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {(job.clients as Record<string, unknown> | null)?.name as string ?? '—'}
                  </TableCell>
                  <TableCell>{formatDate(job.scheduled_date as string | null)}</TableCell>
                  <TableCell className="text-slate-400">
                    {formatDate(job.created_at as string | null)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-16 flex flex-col items-center text-center gap-3">
            <Package className="w-12 h-12 text-slate-300" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-slate-700">No jobs found</p>
              <p className="text-sm text-slate-400 mt-0.5">
                Get started by creating your first job.
              </p>
            </div>
            <Button size="sm" asChild className="mt-1">
              <Link href="/jobs/new">
                <Plus className="w-4 h-4" />
                New Job
              </Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
