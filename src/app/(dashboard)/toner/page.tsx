import { createClient } from '@/lib/supabase/server'
import TonerClient from './TonerClient'

export default async function TonerPage() {
  const supabase = await createClient()

  const [{ data: orders }, { data: clients }] = await Promise.all([
    supabase
      .from('toner_orders')
      .select('*, jobs(id, client_id, clients(id, name))')
      .order('created_at', { ascending: false }),
    supabase.from('clients').select('id, name').order('name'),
  ])

  return (
    <TonerClient
      initialOrders={(orders ?? []) as Parameters<typeof TonerClient>[0]['initialOrders']}
      clients={clients ?? []}
    />
  )
}
