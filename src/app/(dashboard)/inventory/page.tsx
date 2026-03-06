import { createClient } from '@/lib/supabase/server'
import InventoryClient from './InventoryClient'

export default async function InventoryPage() {
  const supabase = await createClient()

  const [
    { data: items },
    { data: movements },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from('inventory')
      .select('*, clients(id, name)')
      .order('inwards_date', { ascending: false }),
    supabase
      .from('warehouse_movements')
      .select('*')
      .order('movement_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('clients').select('id, name').order('name'),
  ])

  const today = new Date()
  const itemsWithDays = (items ?? []).map(item => {
    let days_in_storage: number | null = null
    if (item.inwards_date) {
      const inwards = new Date(item.inwards_date)
      days_in_storage = Math.floor((today.getTime() - inwards.getTime()) / (1000 * 60 * 60 * 24))
    }
    return { ...item, days_in_storage }
  })

  return (
    <InventoryClient
      initialItems={itemsWithDays as Parameters<typeof InventoryClient>[0]['initialItems']}
      initialMovements={(movements ?? []) as Parameters<typeof InventoryClient>[0]['initialMovements']}
      clients={clients ?? []}
    />
  )
}
