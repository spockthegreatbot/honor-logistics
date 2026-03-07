import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import PricingEditor from './PricingEditor'
import { CsvImportSection } from './csv-import-section'
import { XlsxImportSection } from './xlsx-import-section'

export default async function SettingsPage() {
  const supabase = await createClient()

  const [{ data: pricingRules }, { data: clients }, { data: staff }, { data: billingCycles }] = await Promise.all([
    supabase.from('pricing_rules').select('*').order('financial_year', { ascending: false }).order('job_type').order('line_item_name'),
    supabase.from('clients').select('*').order('name'),
    supabase.from('staff').select('*').eq('is_active', true).order('name'),
    supabase.from('billing_cycles').select('id, cycle_name, period_start, period_end, status').order('period_start', { ascending: false }),
  ])

  const allYears = [...new Set((pricingRules ?? []).map(r => String(r.financial_year)).filter(Boolean))].sort().reverse()
  if (!allYears.includes('2025-2026')) allYears.unshift('2025-2026')

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f5f9]">Settings</h1>
        <p className="text-sm text-[#94a3b8] mt-1">Manage pricing, clients, staff, and data imports.</p>
      </div>

      <Tabs defaultValue="pricing">
        <TabsList>
          <TabsTrigger value="pricing">Pricing Rules</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="import">Data Import</TabsTrigger>
        </TabsList>

        {/* Pricing Tab */}
        <TabsContent value="pricing">
          <Card>
            <CardHeader className="border-b border-[#2a2d3e]">
              <CardTitle>Pricing Rules</CardTitle>
              <CardDescription>
                Click any cell to edit inline. Fuel surcharge is 11% on applicable jobs — use{' '}
                <code className="text-xs bg-[#2a2d3e] px-1 rounded">fuel_override</code> on individual jobs for Fixed Price exceptions.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5">
              <PricingEditor
                initialRules={(pricingRules ?? []) as Parameters<typeof PricingEditor>[0]['initialRules']}
                allYears={allYears}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Clients Tab */}
        <TabsContent value="clients">
          <Card>
            <CardHeader className="border-b border-[#2a2d3e]">
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
                          <p className="font-semibold text-[#f1f5f9] text-sm">{String(client.name ?? '—')}</p>
                          {client.trading_name && client.trading_name !== client.name && (
                            <p className="text-xs text-[#94a3b8]">{String(client.trading_name)}</p>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell font-mono text-xs text-[#94a3b8]">
                          {client.abn ? String(client.abn) : '—'}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-[#94a3b8] text-sm">
                          {client.billing_email ? String(client.billing_email) : '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-[#94a3b8] text-sm">
                          {client.payment_terms_days != null ? `${client.payment_terms_days} days` : '—'}
                        </TableCell>
                        <TableCell>
                          {client.is_primary ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30">Primary</span>
                          ) : (
                            <span className="text-[#64748b] text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staff Tab */}
        <TabsContent value="staff">
          <Card>
            <CardHeader className="border-b border-[#2a2d3e]">
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
                    <TableHead className="hidden sm:table-cell">Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(staff ?? []).map((s) => (
                    <TableRow key={String(s.id)}>
                      <TableCell className="font-medium text-[#f1f5f9]">{String(s.name)}</TableCell>
                      <TableCell className="text-[#94a3b8] text-sm">{String(s.email)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          s.role === 'admin'    ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30' :
                          s.role === 'manager'  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' :
                          s.role === 'driver'   ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30' :
                                                  'bg-[#2a2d3e] text-[#94a3b8]'
                        }`}>
                          {String(s.role)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-[#94a3b8] text-sm">
                        {s.phone ? String(s.phone) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Import Tab */}
        <TabsContent value="import">
          <div className="space-y-6">
            <XlsxImportSection billingCycles={billingCycles ?? []} />
            <div className="border-t border-[#2a2d3e] pt-6">
              <p className="text-xs text-[#64748b] mb-4 px-1">Legacy: Import individual CSV sheets</p>
              <CsvImportSection />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
