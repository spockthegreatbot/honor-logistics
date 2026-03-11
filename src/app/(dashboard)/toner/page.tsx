import { createClient } from '@/lib/supabase/server'
import TonerClient from './TonerClient'

export default async function TonerPage() {
  const supabase = await createClient()

  const [{ data: tonerJobs }, { data: clients }] = await Promise.all([
    supabase
      .from('jobs')
      .select(`
        id, job_number, status, scheduled_date, created_at,
        address_to, machine_model, serial_number, contact_name,
        order_types, notes, tracking_number,
        clients(id, name),
        end_customers(name)
      `)
      .eq('job_type', 'toner')
      .order('scheduled_date', { ascending: false, nullsFirst: false }),
    supabase.from('clients').select('id, name').order('name'),
  ])

  return (
    <TonerClient
      tonerJobs={(tonerJobs ?? []) as unknown as Parameters<typeof TonerClient>[0]['tonerJobs']}
      clients={clients ?? []}
    />
  )
}
