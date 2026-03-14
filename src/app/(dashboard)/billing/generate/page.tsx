import { createClient } from '@/lib/supabase/server'
import { BILLING_CLIENTS } from '@/lib/client-colors'
import InvoiceBuilder from './InvoiceBuilder'

interface ClientWithStats {
  id: string
  name: string
  color_code: string | null
  billing_cycle_frequency: string | null
  ready_count: number
  last_cycle_end: string | null
}

export default async function GenerateInvoicePage({ searchParams }: { searchParams: Promise<{ client?: string; jobs?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()

  // Get billing clients
  const { data: allClients } = await supabase
    .from('clients')
    .select('id, name, color_code, billing_cycle_frequency')
    .order('name')

  const billingClients = (allClients ?? []).filter((c) =>
    BILLING_CLIENTS.includes(c.name as typeof BILLING_CLIENTS[number])
  )

  // For each client, get count of un-invoiced jobs and last billing cycle end date
  const clientStats: ClientWithStats[] = await Promise.all(
    billingClients.map(async (client) => {
      // Count all unbilled jobs (any status except cancelled, exclude toner)
      const { count: readyCount } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .is('billing_cycle_id', null)
        .not('status', 'in', '(cancelled)')
        .neq('job_type', 'toner')

      // Get last billing cycle end date
      const { data: lastCycle } = await supabase
        .from('billing_cycles')
        .select('period_end')
        .eq('client_id', client.id)
        .in('status', ['review', 'invoiced', 'paid'])
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle()

      return {
        id: client.id,
        name: client.name,
        color_code: client.color_code,
        billing_cycle_frequency: client.billing_cycle_frequency ?? null,
        ready_count: readyCount ?? 0,
        last_cycle_end: lastCycle?.period_end ?? null,
      }
    })
  )

  return (
    <InvoiceBuilder
      clients={clientStats}
      initialClientId={sp.client}
      initialJobIds={sp.jobs?.split(',')}
    />
  )
}
