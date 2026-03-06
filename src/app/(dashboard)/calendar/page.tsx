import { createClient } from '@/lib/supabase/server'
import { CalendarClient } from './CalendarClient'

export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const supabase = await createClient()

  // Fetch all jobs that have a scheduled date
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_number, job_type, status, scheduled_date, clients(name), end_customers(name)')
    .not('scheduled_date', 'is', null)
    .not('status', 'in', '(cancelled)')
    .order('scheduled_date', { ascending: true })

  return <CalendarClient jobs={(jobs as never[]) ?? []} />
}
