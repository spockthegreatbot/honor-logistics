import Link from 'next/link'
import { Receipt, Plus, Filter } from 'lucide-react'
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
  open:     'bg-blue-100 text-blue-700 border border-blue-200',
  review:   'bg-amber-100 text-amber-700 border border-amber-200',
  invoiced: 'bg-purple-100 text-purple-700 border border-purple-200',
  paid:     'bg-green-100 text-green-700 border border-green-200',
}

const billingStatusLabels: Record<string, string> = {
  open:     'Open',
  review:   'In Review',
  invoiced: 'Invoiced',
  paid:     'Paid',
}

interface PageProps {
  searchParams: Promise<{ client?: string; status?: string }>
}

export default async function BillingPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const clientFilter = sp.client ?? 'all'
  const statusFilter = sp.status ?? 'all'

  const supabase = await createClient()

  // Fetch all clients + billing cycles in parallel
  const [{ data: clients }, { data: allCycles }] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase
      .from('billing_cycles')
      .select('*, clients(id, name)')
      .order('created_at', { ascending: false }),
  ])

  // Open cycles per client — for the summary strip
  const openByClient = (allCycles ?? []).reduce<Record<string, number>>((acc, c) => {
    const clientId = (c.clients as { id: string } | null)?.id ?? 'unknown'
    if (c.status === 'open') acc[clientId] = (acc[clientId] ?? 0) + 1
    return acc
  }, {})

  // Apply filters client-side (server component — no JS needed)
  const cycles = (allCycles ?? []).filter((c) => {
    const cId = (c.clients as { id: string } | null)?.id
    if (clientFilter !== 'all' && cId !== clientFilter) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    return true
  })

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing Cycles</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Each client has independent billing cycles — filter by client below.
          </p>
        </div>
        <Button size="sm" asChild className="w-full sm:w-auto">
          <Link href="/billing/new">
            <Plus className="w-4 h-4" />
            New Cycle
          </Link>
        </Button>
      </div>

      {/* ── Open Cycles Summary Strip ───────────────────────────── */}
      {clients && clients.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {clients.map((client) => {
            const open = openByClient[client.id] ?? 0
            const isActive = clientFilter === client.id
            return (
              <Link
                key={client.id}
                href={`/billing?client=${client.id}`}
                className={cn(
                  'rounded-xl border p-3 text-center transition-all',
                  isActive
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <p className={cn('text-lg font-bold', open > 0 ? 'text-orange-600' : 'text-slate-400')}>
                  {open}
                </p>
                <p className="text-xs text-slate-600 font-medium truncate">{client.name}</p>
                <p className="text-xs text-slate-400">open</p>
              </Link>
            )
          })}
          <Link
            href="/billing"
            className={cn(
              'rounded-xl border p-3 text-center transition-all',
              clientFilter === 'all'
                ? 'border-orange-300 bg-orange-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            )}
          >
            <p className="text-lg font-bold text-slate-700">{(allCycles ?? []).filter(c => c.status === 'open').length}</p>
            <p className="text-xs text-slate-600 font-medium">All Clients</p>
            <p className="text-xs text-slate-400">open</p>
          </Link>
        </div>
      )}

      {/* ── Status filter pills ─────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
        {['all', 'open', 'review', 'invoiced', 'paid'].map((s) => (
          <Link
            key={s}
            href={`/billing?${clientFilter !== 'all' ? `client=${clientFilter}&` : ''}status=${s}`}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
              statusFilter === s
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            )}
          >
            {s === 'all' ? 'All statuses' : billingStatusLabels[s]}
          </Link>
        ))}
      </div>

      {/* ── Cycles Table ────────────────────────────────────────── */}
      <Card>
        {cycles.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden sm:table-cell">Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Total</TableHead>
                  <TableHead className="hidden md:table-cell">Invoice #</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((cycle) => {
                  const status = String(cycle.status ?? 'open')
                  const period =
                    cycle.period_start || cycle.period_end
                      ? `${formatDate(cycle.period_start as string)} – ${formatDate(cycle.period_end as string)}`
                      : '—'
                  const clientName = (cycle.clients as { name: string } | null)?.name ?? '—'

                  return (
                    <TableRow key={String(cycle.id)}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/billing/${cycle.id}`}
                          className="text-slate-900 hover:text-orange-600 transition-colors"
                        >
                          {String(cycle.cycle_name ?? `Cycle ${String(cycle.id).slice(0, 6)}`)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                          {clientName}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs hidden sm:table-cell">{period}</TableCell>
                      <TableCell>
                        <span className={cn(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                          billingStatusStyles[status] ?? 'bg-slate-100 text-slate-600'
                        )}>
                          {billingStatusLabels[status] ?? status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-slate-900 hidden sm:table-cell">
                        {formatCurrency(cycle.grand_total as number | null)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500 hidden md:table-cell">
                        {cycle.xero_invoice_number ? String(cycle.xero_invoice_number) : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center text-center gap-3 px-4">
            <Receipt className="w-12 h-12 text-slate-300" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-slate-700">No billing cycles</p>
              <p className="text-sm text-slate-400 mt-0.5">
                {clientFilter !== 'all'
                  ? 'No cycles for this client yet — create the first one.'
                  : 'Billing cycles will appear here once created.'}
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
