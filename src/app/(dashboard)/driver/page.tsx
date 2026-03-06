import { createClient } from '@/lib/supabase/server'
import DriverClient from './DriverClient'

export const dynamic = 'force-dynamic'

export default async function DriverPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*, end_customers(name), staff:assigned_to(name)')
    .eq('scheduled_date', today)
    .not('status', 'eq', 'cancelled')
    .order('created_at')

  return <DriverClient initialJobs={(jobs ?? []) as Parameters<typeof DriverClient>[0]['initialJobs']} today={today} />
}
