import Link from 'next/link'
import { Receipt, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { formatDate, formatCurrency, cn } from '@/lib/utils'

const billingStatusStyles: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  review: 'bg-amber-100 text-amber-700',
  invoiced: 'bg-purple-100 text-purple-700',
  paid: 'bg-green-100 text-green-700',
}

const billingStatusLabels: Record<string, string> = {
  open: 'Open',
  review: 'In Review',
  invoiced: 'Invoiced',
  paid: 'Paid',
}

export default async function BillingPage() {
  const supabase = await createClient()

  const { data: cycles } = await supabase
    .from('billing_cycles')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Billing Cycles</h1>
        <Button size="sm" asChild>
          <Link href="/billing/new">
            <Plus className="w-4 h-4" />
            New Cycle
          </Link>
        </Button>
      </div>

      <Card>
        {cycles && cycles.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cycle Name</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Grand Total</TableHead>
                <TableHead>Invoice #</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cycles.map((cycle: Record<string, unknown>) => {
                const status = String(cycle.status ?? 'open')
                const periodStart = formatDate(cycle.period_start as string | null)
                const periodEnd = formatDate(cycle.period_end as string | null)
                const period =
                  cycle.period_start || cycle.period_end
                    ? `${periodStart} – ${periodEnd}`
                    : '—'

                return (
                  <TableRow key={String(cycle.id)}>
                    <TableCell className="font-medium text-slate-900">
                      <Link
                        href={`/billing/${cycle.id}`}
                        className="hover:text-orange-600 transition-colors"
                      >
                        {String(cycle.name ?? cycle.id)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {(cycle.clients as Record<string, unknown> | null)?.name as string ?? '—'}
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs">{period}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                          billingStatusStyles[status] ?? 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {billingStatusLabels[status] ?? status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">
                      {formatCurrency(cycle.grand_total as number | null)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {String(cycle.invoice_number ?? '—')}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="py-16 flex flex-col items-center text-center gap-3">
            <Receipt className="w-12 h-12 text-slate-300" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-slate-700">No billing cycles</p>
              <p className="text-sm text-slate-400 mt-0.5">
                Billing cycles will appear here once created.
              </p>
            </div>
            <Button size="sm" asChild className="mt-1">
              <Link href="/billing/new">
                <Plus className="w-4 h-4" />
                New Cycle
              </Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
