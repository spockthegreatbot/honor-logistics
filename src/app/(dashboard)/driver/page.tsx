import { createClient } from '@/lib/supabase/server'
import DriverClient from './DriverClient'

export const dynamic = 'force-dynamic'

export default async function DriverPage() {
  const supabase = await createClient()

  // Today in Australia/Sydney timezone (YYYY-MM-DD)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' })

  // Fetch all non-terminal jobs — client will filter for today vs all-active
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_number, job_type, status, serial_number, machine_model, address_to, contact_name, contact_phone, order_types, scheduled_date, notes, aod_pdf_url, end_customers(name)')
    .not('status', 'in', '(invoiced,cancelled)')
    .order('scheduled_date', { ascending: true })
    .order('created_at', { ascending: true })

  return (
    <DriverClient
      initialJobs={(jobs ?? []) as unknown as Parameters<typeof DriverClient>[0]['initialJobs']}
      today={today}
    />
  )
}
