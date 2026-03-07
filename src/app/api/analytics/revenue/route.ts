import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

export async function GET(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const months = Math.min(Number(searchParams.get('months') ?? 2), 12)

  // Get billing cycles from the last N months
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const { data: cycles, error } = await supabase
    .from('billing_cycles')
    .select('grand_total, period_end, clients(id, name)')
    .gte('period_end', cutoffStr)
    .order('period_end')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Group by client + month
  const grouped: Record<string, Record<string, number>> = {}
  for (const c of cycles ?? []) {
    const clientData = c.clients as unknown as { name: string } | null
    const client = clientData?.name ?? 'Unknown'
    const month = (c.period_end as string)?.slice(0, 7) ?? 'Unknown'
    if (!grouped[month]) grouped[month] = {}
    grouped[month][client] = (grouped[month][client] ?? 0) + Number(c.grand_total ?? 0)
  }

  // Convert to array format for Recharts
  const result = Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, clients]) => ({
      month,
      ...clients,
    }))

  // Get unique client names
  const clientNames = [...new Set(
    (cycles ?? []).map(c => (c.clients as unknown as { name: string } | null)?.name ?? 'Unknown')
  )]

  return NextResponse.json({ data: result, clients: clientNames })
}
