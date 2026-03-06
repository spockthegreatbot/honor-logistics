import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BillingCycleClient from './BillingCycleClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BillingCyclePage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cycle, error } = await supabase
    .from('billing_cycles')
    .select('*, clients(id, name, billing_email)')
    .eq('id', id)
    .single()

  if (error || !cycle) notFound()

  const { data: jobs } = await supabase
    .from('jobs')
    .select(`
      *,
      clients(id, name),
      end_customers(id, name),
      machines(id, model, make),
      runup_details(*),
      install_details(*),
      delivery_details(*),
      toner_orders(*)
    `)
    .eq('billing_cycle_id', id)
    .order('scheduled_date')

  const { data: storageWeekly } = await supabase
    .from('storage_weekly')
    .select('*')
    .eq('billing_cycle_id', id)
    .order('created_at')

  const { data: pricing } = await supabase
    .from('pricing_rules')
    .select('*')
    .eq('financial_year', cycle.financial_year ?? '2025-2026')
    .eq('is_active', true)

  return (
    <BillingCycleClient
      cycle={cycle as Parameters<typeof BillingCycleClient>[0]['cycle']}
      jobs={(jobs ?? []) as Parameters<typeof BillingCycleClient>[0]['jobs']}
      storageWeekly={(storageWeekly ?? []) as Parameters<typeof BillingCycleClient>[0]['storageWeekly']}
      pricingRules={(pricing ?? []) as Parameters<typeof BillingCycleClient>[0]['pricingRules']}
    />
  )
}
