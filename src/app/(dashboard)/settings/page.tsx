import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'

export default async function SettingsPage() {
  const supabase = await createClient()

  const [{ data: pricingRules }, { data: clients }] = await Promise.all([
    supabase
      .from('pricing_rules')
      .select('*')
      .eq('financial_year', '2025-2026')
      .eq('is_active', true)
      .order('job_type')
      .order('line_item'),
    supabase
      .from('clients')
      .select('*')
      .order('name'),
  ])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      {/* Pricing Rules */}
      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Pricing Rules FY2025-26</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pricingRules && pricingRules.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line Item</TableHead>
                  <TableHead>Machine Type</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Fuel Applicable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricingRules.map((rule: Record<string, unknown>) => (
                  <TableRow key={String(rule.id)}>
                    <TableCell className="font-medium text-slate-900">
                      {String(rule.line_item ?? '—')}
                    </TableCell>
                    <TableCell>{String(rule.machine_type ?? '—')}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(rule.unit_price as number | null)}
                    </TableCell>
                    <TableCell className="text-slate-500">{String(rule.unit ?? '—')}</TableCell>
                    <TableCell>
                      {rule.fuel_applicable ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                          No
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 flex flex-col items-center text-center gap-2">
              <p className="text-sm text-slate-500">No pricing rules configured for FY2025-26.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Clients */}
      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Clients</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {clients && clients.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Trading Name</TableHead>
                  <TableHead>ABN</TableHead>
                  <TableHead>Billing Email</TableHead>
                  <TableHead>Payment Terms</TableHead>
                  <TableHead>Primary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client: Record<string, unknown>) => (
                  <TableRow key={String(client.id)}>
                    <TableCell className="font-semibold text-slate-900">
                      {String(client.name ?? '—')}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {String(client.trading_name ?? '—')}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {String(client.abn ?? '—')}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {String(client.billing_email ?? '—')}
                    </TableCell>
                    <TableCell>
                      {client.payment_terms != null
                        ? `${client.payment_terms} days`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {client.is_primary ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">
                          Primary
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 flex flex-col items-center text-center gap-2">
              <p className="text-sm text-slate-500">No clients found.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
