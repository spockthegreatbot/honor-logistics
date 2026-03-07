import { createClient } from '@/lib/supabase/server'
import { ArchiveClient } from './ArchiveClient'
import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

async function ArchivePageInner() {
  const supabase = await createClient()

  const [{ data: jobs, count }, { data: clients }] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, job_number, job_type, status, scheduled_date, created_at, notes, clients(id, name), end_customers(name)', { count: 'exact' })
      .in('status', ['complete', 'invoiced', 'cancelled'])
      .order('scheduled_date', { ascending: false })
      .limit(5000),
    supabase
      .from('clients')
      .select('id, name')
      .order('name'),
  ])

  return (
    <ArchiveClient
      jobs={(jobs as never[]) ?? []}
      clients={clients ?? []}
      totalCount={count ?? 0}
    />
  )
}

export default function ArchivePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 space-y-5">
          <div className="h-8 w-48 bg-[#2a2d3e] rounded-lg animate-pulse" />
          <div className="h-96 bg-[#1e2130] rounded-xl animate-pulse" />
        </div>
      }
    >
      <ArchivePageInner />
    </Suspense>
  )
}
