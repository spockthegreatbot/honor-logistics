import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils'
import { CsvImportSection } from './csv-import-section'

export default async function SettingsPage() {
  const supabase = await createClient()

  const [{ data: pricingRules }, { data: clients }, { data: staff }] = await Promise.all([
    supabase
      .from('pricing_rules')
      .select('*')
      .eq('financial_year', '2025-2026')
      .eq('is_active', true)
      .order('job_type')
      .order('line_item_name'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('staff').select('*').eq('is_active', true).order('name'),
  ])

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage pricing, clients, staff, and data imports.</p>
      </div>

      {/* ── Pricing Rules ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Pricing Rules — FY2025-26</CardTitle>
          <CardDescription>
            Fuel surcharge is hardcoded at 11% on all applicable jobs (not configurable here).
            Use <code className="text-xs bg-slate-100 px-1 rounded">fuel_override</code> on individual jobs for Fixed Price / Price Match exceptions.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Type</TableHead>
                  <TableHead>Line Item</TableHead>
                  <TableHead className="hidden sm:table-cell">Machine Type</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="hidden sm:table-cell">Unit</TableHead>
                  <TableHead className="hidden md:table-cell">Fuel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pricingRules ?? []).map((rule) => (
                  <TableRow key={String(rule.id)}>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                        {String(rule.job_type ?? '—')}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-slate-900 text-sm">
                      {String(rule.line_item_name ?? '—')}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-slate-500 text-xs">
                      {rule.machine_type ? String(rule.machine_type) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">
                      {formatCurrency(rule.unit_price as number)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-slate-500 text-xs">
                      {String(rule.unit ?? '—')}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {rule.fuel_applicable ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">+11%</span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Clients ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Billing Clients</CardTitle>
          <CardDescription>Each client can have independent open billing cycles simultaneously.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">ABN</TableHead>
                  <TableHead className="hidden sm:table-cell">Billing Email</TableHead>
                  <TableHead className="hidden md:table-cell">Terms</TableHead>
                  <TableHead>Primary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(clients ?? []).map((client) => (
                  <TableRow key={String(client.id)}>
                    <TableCell>
                      <p className="font-semibold text-slate-900 text-sm">{String(client.name ?? '—')}</p>
                      {client.trading_name && client.trading_name !== client.name && (
                        <p className="text-xs text-slate-500">{String(client.trading_name)}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs text-slate-600">
                      {client.abn ? String(client.abn) : '—'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-slate-600 text-sm">
                      {client.billing_email ? String(client.billing_email) : '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-slate-500 text-sm">
                      {client.payment_terms_days != null ? `${client.payment_terms_days} days` : '—'}
                    </TableCell>
                    <TableCell>
                      {client.is_primary ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">Primary</span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Staff ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b border-slate-100">
          <CardTitle>Staff</CardTitle>
          <CardDescription>Active staff members. Auth linked via Supabase Dashboard → Authentication.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(staff ?? []).map((s) => (
                <TableRow key={String(s.id)}>
                  <TableCell className="font-medium text-slate-900">{String(s.name)}</TableCell>
                  <TableCell className="text-slate-600 text-sm">{String(s.email)}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                      s.role === 'admin'     ? 'bg-purple-100 text-purple-700' :
                      s.role === 'manager'   ? 'bg-blue-100 text-blue-700' :
                      s.role === 'driver'    ? 'bg-orange-100 text-orange-700' :
                                              'bg-slate-100 text-slate-700'
                    }`}>
                      {String(s.role)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Historical Data Import ──────────────────────────────── */}
      <CsvImportSection />
    </div>
  )
}
