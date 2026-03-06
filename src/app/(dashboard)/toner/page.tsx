import Link from 'next/link'
import { Printer, Plus } from 'lucide-react'
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

const tonerStatusStyles: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  packed: 'bg-blue-100 text-blue-700',
  dispatched: 'bg-orange-100 text-orange-700',
  delivered: 'bg-green-100 text-green-700',
}

const tonerStatusLabels: Record<string, string> = {
  pending: 'Pending',
  packed: 'Packed',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
}

export default async function TonerPage() {
  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('toner_orders')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Toner Orders</h1>
        <Button size="sm" asChild>
          <Link href="/toner/new">
            <Plus className="w-4 h-4" />
            New Order
          </Link>
        </Button>
      </div>

      <Card>
        {orders && orders.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NI #</TableHead>
                <TableHead>Courier</TableHead>
                <TableHead>Tracking</TableHead>
                <TableHead>Weight (kg)</TableHead>
                <TableHead>Dispatch</TableHead>
                <TableHead>Est. Delivery</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order: Record<string, unknown>) => {
                const status = String(order.status ?? 'pending')
                return (
                  <TableRow key={String(order.id)}>
                    <TableCell className="font-mono font-semibold text-orange-600">
                      {String(order.ni_number ?? '—')}
                    </TableCell>
                    <TableCell>{String(order.courier ?? '—')}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {String(order.tracking_number ?? '—')}
                    </TableCell>
                    <TableCell>
                      {order.weight_kg != null ? `${order.weight_kg} kg` : '—'}
                    </TableCell>
                    <TableCell>{formatDate(order.dispatch_date as string | null)}</TableCell>
                    <TableCell>{formatDate(order.estimated_delivery as string | null)}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                          tonerStatusStyles[status] ?? 'bg-slate-100 text-slate-600'
                        )}
                      >
                        {tonerStatusLabels[status] ?? status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(order.total_amount as number | null)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="py-16 flex flex-col items-center text-center gap-3">
            <Printer className="w-12 h-12 text-slate-300" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-slate-700">No toner orders</p>
              <p className="text-sm text-slate-400 mt-0.5">
                Toner orders will appear here once created.
              </p>
            </div>
            <Button size="sm" asChild className="mt-1">
              <Link href="/toner/new">
                <Plus className="w-4 h-4" />
                New Order
              </Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
