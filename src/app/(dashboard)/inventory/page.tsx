import Link from 'next/link'
import { Package, Plus } from 'lucide-react'
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
import { formatDate, cn } from '@/lib/utils'

const conditionStyles: Record<string, string> = {
  new:          'bg-green-500/15 text-green-400 border border-green-500/30',
  refurb:       'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  faulty:       'bg-red-500/15 text-red-400 border border-red-500/30',
  for_disposal: 'bg-[#2a2d3e] text-[#94a3b8]',
}

const conditionLabels: Record<string, string> = {
  new: 'New',
  refurb: 'Refurb',
  faulty: 'Faulty',
  for_disposal: 'For Disposal',
}

export default async function InventoryPage() {
  const supabase = await createClient()

  const { data: items, count } = await supabase
    .from('inventory')
    .select('*, machines(name, model)', { count: 'exact' })
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[#f1f5f9]">Inventory</h1>
          {count != null && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#2a2d3e] text-[#94a3b8]">
              {count}
            </span>
          )}
        </div>
        <Button size="sm" asChild>
          <Link href="/inventory/new">
            <Plus className="w-4 h-4" />
            Add Item
          </Link>
        </Button>
      </div>

      <Card>
        {items && items.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>S/N</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Inwards Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item: Record<string, unknown>) => {
                const condition = String(item.condition ?? '')
                return (
                  <TableRow key={String(item.id)}>
                    <TableCell className="font-medium text-[#f1f5f9] max-w-xs">
                      <div className="truncate">
                        {String(
                          (item.machines as Record<string, unknown> | null)?.name
                            ?? item.description
                            ?? '—'
                        )}
                      </div>
                      {(item.machines as Record<string, unknown> | null)?.model != null && (
                        <div className="text-xs text-[#94a3b8] truncate">
                          {String((item.machines as Record<string, unknown>).model)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-[#94a3b8]">
                      {String(item.serial_number ?? '—')}
                    </TableCell>
                    <TableCell className="text-[#94a3b8]">{String(item.brand ?? '—')}</TableCell>
                    <TableCell className="text-[#94a3b8]">{String(item.location ?? '—')}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                          conditionStyles[condition] ?? 'bg-[#2a2d3e] text-[#94a3b8]'
                        )}
                      >
                        {conditionLabels[condition] ?? condition}
                      </span>
                    </TableCell>
                    <TableCell className="text-[#94a3b8]">{formatDate(item.inwards_date as string | null)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="py-16 flex flex-col items-center text-center gap-3">
            <Package className="w-12 h-12 text-[#2a2d3e]" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-[#f1f5f9]">No inventory items</p>
              <p className="text-sm text-[#94a3b8] mt-0.5">
                Items logged inwards will appear here.
              </p>
            </div>
            <Button size="sm" asChild className="mt-1">
              <Link href="/inventory/new">
                <Plus className="w-4 h-4" />
                Add Item
              </Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
