import { createClient } from '@/lib/supabase/server'
import { CalendarClient } from './CalendarClient'

export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const supabase = await createClient()

  // Mirror the kanban board exactly — same jobs, same filters
  // No date range cap: calendar shows everything on the active board
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_number, job_type, status, scheduled_date, archived, clients(name), end_customers(name)')
    .not('scheduled_date', 'is', null)
    .neq('archived', true)
    .not('status', 'in', '(cancelled)')
    .neq('job_type', 'toner')
    .order('scheduled_date', { ascending: true })

  return <CalendarClient jobs={(jobs as never[]) ?? []} />
}
