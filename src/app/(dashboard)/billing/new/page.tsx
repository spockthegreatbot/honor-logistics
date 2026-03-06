import { createClient } from '@/lib/supabase/server'
import NewBillingCycleClient from './NewBillingCycleClient'

export default async function NewBillingCyclePage() {
  const supabase = await createClient()
  const { data: clients } = await supabase.from('clients').select('id, name').order('name')
  return <NewBillingCycleClient clients={clients ?? []} />
}
