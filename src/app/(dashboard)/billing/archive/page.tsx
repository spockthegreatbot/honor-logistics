import { createClient } from '@/lib/supabase/server'
import { ArchiveClient } from './ArchiveClient'

export const dynamic = 'force-dynamic'

export default async function ArchivePage() {
  const supabase = await createClient()

  const { data: cycles } = await supabase
    .from('billing_cycles')
    .select('id, cycle_name, financial_year, period_start, period_end, subtotal, grand_total, gst_amount, status, total_runup, total_delivery, total_fuel_surcharge, total_install, total_storage')
    .eq('client_id', 'e35458d3-eef4-41cc-8be7-e9d331a657d3')
    .order('period_start', { ascending: false })

  return <ArchiveClient cycles={cycles ?? []} />
}
