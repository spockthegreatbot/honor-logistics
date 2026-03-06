import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { JobsClient } from './JobsClient'

export const dynamic = 'force-dynamic'

async function JobsPageInner() {
  const supabase = await createClient()

  const { data: jobs, count } = await supabase
    .from('jobs')
    .select(
      '*, clients(name), end_customers(name), staff:assigned_to(name), runup_details(check_signed_off)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })

  return (
    <JobsClient
      initialJobs={(jobs as never[]) ?? []}
      count={count ?? 0}
    />
  )
}

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 space-y-5">
          <div className="h-8 w-48 bg-[#2a2d3e] rounded-lg animate-pulse" />
          <div className="h-64 bg-[#1e2130] rounded-xl animate-pulse" />
        </div>
      }
    >
      <JobsPageInner />
    </Suspense>
  )
}
