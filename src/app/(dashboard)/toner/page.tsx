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
  pending:    'bg-[#2a2d3e] text-[#94a3b8]',
  packed:     'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  dispatched: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
  delivered:  'bg-green-500/15 text-green-400 border border-green-500/30',
}

const tonerStatusLabels: Record<string, string> = {
  pending:    'Pending',
  packed:     'Packed',
  dispatched: 'Dispatched',
  delivered:  'Delivered',
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
        <h1 className="text-2xl font-bold text-[#f1f5f9]">Toner Orders</h1>
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
                    <TableCell className="font-mono font-semibold text-orange-400">
                      {String(order.efex_ni ?? order.ni_number ?? '—')}
                    </TableCell>
                    <TableCell className="text-[#94a3b8]">{String(order.courier ?? '—')}</TableCell>
                    <TableCell className="font-mono text-xs text-[#94a3b8]">
                      {String(order.tracking_number ?? '—')}
                    </TableCell>
                    <TableCell className="text-[#94a3b8]">
                      {order.weight_kg != null ? `${order.weight_kg} kg` : '—'}
                    </TableCell>
                    <TableCell className="text-[#94a3b8]">{formatDate(order.dispatch_date as string | null)}</TableCell>
                    <TableCell className="text-[#94a3b8]">{formatDate(order.est_delivery as string | null)}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                          tonerStatusStyles[status] ?? 'bg-[#2a2d3e] text-[#94a3b8]'
                        )}
                      >
                        {tonerStatusLabels[status] ?? status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium text-[#f1f5f9]">
                      {formatCurrency(order.total_price as number | null)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="py-16 flex flex-col items-center text-center gap-3">
            <Printer className="w-12 h-12 text-[#2a2d3e]" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-[#f1f5f9]">No toner orders</p>
              <p className="text-sm text-[#94a3b8] mt-0.5">
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
