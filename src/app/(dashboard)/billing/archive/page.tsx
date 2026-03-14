import { createClient } from '@/lib/supabase/server'
import { ArchiveClient } from './ArchiveClient'

export const dynamic = 'force-dynamic'

export default async function ArchivePage() {
  const supabase = await createClient()

  const { data: cycles } = await supabase
    .from('billing_cycles')
    .select('id, cycle_name, financial_year, period_start, period_end, subtotal, grand_total, gst_amount, status, total_runup, total_delivery, total_fuel_surcharge, total_install, total_storage, clients(id, name, color_code)')
    .order('period_start', { ascending: false })

  // Supabase returns joined clients as array; normalize to single object
  const normalized = (cycles ?? []).map(c => ({
    ...c,
    clients: Array.isArray(c.clients) ? (c.clients[0] ?? null) : c.clients,
  }))

  return <ArchiveClient cycles={normalized} />
}
