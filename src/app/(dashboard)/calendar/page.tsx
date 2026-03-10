import { createClient } from '@/lib/supabase/server'
import { CalendarClient } from './CalendarClient'

export const dynamic = 'force-dynamic'

export default async function CalendarPage() {
  const supabase = await createClient()

  // Fetch jobs within a 3-month window (1 month back, 2 months ahead)
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString().split('T')[0]

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_number, job_type, status, scheduled_date, archived, clients(name), end_customers(name)')
    .not('scheduled_date', 'is', null)
    .not('status', 'in', '(cancelled,done,complete,completed,invoiced)')
    .neq('archived', true)
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date', { ascending: true })

  return <CalendarClient jobs={(jobs as never[]) ?? []} />
}
