import { createClient } from '@/lib/supabase/server'
import AnalyticsClient from './AnalyticsClient'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const supabase = await createClient()

  // Determine current FY (July-June). If before July, FY started prev year.
  const now = new Date()
  const fyStart = now.getMonth() >= 6
    ? new Date(now.getFullYear(), 6, 1)
    : new Date(now.getFullYear() - 1, 6, 1)
  const fyStartStr = fyStart.toISOString().split('T')[0]

  // This month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  // Billing cycles for revenue
  const { data: cycles } = await supabase
    .from('billing_cycles')
    .select('id, grand_total, period_end, status, client_id, clients(name)')
    .in('status', ['closed', 'invoiced', 'paid', 'review'])
    .gte('period_end', fyStartStr)

  // All jobs this FY
  const { data: fyJobs, count: fyJobCount } = await supabase
    .from('jobs')
    .select('id', { count: 'exact' })
    .gte('created_at', fyStartStr)

  // Active inventory count
  const { count: activeInventory } = await supabase
    .from('inventory')
    .select('id', { count: 'exact' })
    .eq('is_active', true)

  // Jobs by type (all time)
  const { data: allJobs } = await supabase
    .from('jobs')
    .select('job_type')

  // Jobs this month by status
  const { data: monthJobs } = await supabase
    .from('jobs')
    .select('status')
    .gte('created_at', monthStart)
    .lte('created_at', monthEnd + 'T23:59:59')

  // Calculate revenue by month (last 12 months)
  const revenueByMonth: { month: string; total: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' })
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1)
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const total = (cycles ?? [])
      .filter((c) => {
        if (!c.period_end) return false
        const pe = new Date(c.period_end)
        return pe >= mStart && pe <= mEnd
      })
      .reduce((sum, c) => sum + (c.grand_total ?? 0), 0)
    revenueByMonth.push({ month: label, total })
  }

  // FY total revenue
  const fyRevenue = (cycles ?? []).reduce((sum, c) => sum + (c.grand_total ?? 0), 0)

  // This month revenue
  const thisMonthRevenue = revenueByMonth[revenueByMonth.length - 1]?.total ?? 0

  // Jobs by type counts
  const jobsByType: Record<string, number> = {}
  for (const j of allJobs ?? []) {
    jobsByType[j.job_type] = (jobsByType[j.job_type] ?? 0) + 1
  }

  // Jobs by status this month
  const jobsByStatus: Record<string, number> = {}
  for (const j of monthJobs ?? []) {
    const s = j.status ?? 'unknown'
    jobsByStatus[s] = (jobsByStatus[s] ?? 0) + 1
  }

  // Top clients by revenue
  const clientRevenue: Record<string, { name: string; total: number }> = {}
  for (const c of cycles ?? []) {
    const cid = c.client_id
    if (!cid) continue
    const clientData = (c as { clients?: { name: string } | { name: string }[] | null }).clients
    const name = Array.isArray(clientData) ? clientData[0]?.name ?? 'Unknown' : clientData?.name ?? 'Unknown'
    if (!clientRevenue[cid]) clientRevenue[cid] = { name, total: 0 }
    clientRevenue[cid].total += c.grand_total ?? 0
  }
  const topClients = Object.values(clientRevenue).sort((a, b) => b.total - a.total).slice(0, 10)

  return (
    <AnalyticsClient
      fyRevenue={fyRevenue}
      thisMonthRevenue={thisMonthRevenue}
      fyJobCount={fyJobCount ?? 0}
      activeInventory={activeInventory ?? 0}
      revenueByMonth={revenueByMonth}
      jobsByType={jobsByType}
      jobsByStatus={jobsByStatus}
      topClients={topClients}
    />
  )
}
