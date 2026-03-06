import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PrintButton } from './PrintButton'

interface PageProps {
  params: Promise<{ id: string }>
}

function formatCurrency(val: number | null) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(val ?? 0)
}

function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function InvoicePreviewPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: cycle, error } = await supabase
    .from('billing_cycles')
    .select('*, clients(id, name)')
    .eq('id', id)
    .single()

  if (error || !cycle) notFound()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*, end_customers(name)')
    .eq('billing_cycle_id', id)
    .order('job_type')
    .order('scheduled_date')

  const allJobs = jobs ?? []

  // Group jobs by type
  const runups = allJobs.filter((j) => j.job_type === 'runup')
  const deliveries = allJobs.filter((j) => j.job_type === 'delivery' || j.job_type === 'collection')
  const installs = allJobs.filter((j) => j.job_type === 'install')
  const others = allJobs.filter((j) => !['runup', 'delivery', 'collection', 'install'].includes(j.job_type))

  const clientName = (cycle as { clients?: { name: string } | null }).clients?.name ?? 'Client'

  const subtotal = cycle.subtotal ?? 0
  const gst = cycle.gst_amount ?? (subtotal * 0.1)
  const grandTotal = cycle.grand_total ?? (subtotal + gst)
  const discount = cycle.discount_amount ?? 0
  const fuelSurcharge = cycle.total_fuel_surcharge ?? 0

  const invoiceNumber = cycle.xero_invoice_number ?? cycle.cycle_name ?? `INV-${id.slice(0, 6).toUpperCase()}`
  const invoiceDate = formatDate(cycle.period_end)
  const periodStr = `${formatDate(cycle.period_start)} - ${formatDate(cycle.period_end)}`

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="min-h-screen bg-white text-black p-8 max-w-4xl mx-auto print:p-4">
        {/* Print button */}
        <div className="no-print mb-6 flex justify-end">
          <PrintButton />
        </div>

        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Honor Removals &amp; Logistics</h1>
            <p className="text-sm text-gray-600 mt-1">ABN: 87 628 874 881</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold text-gray-800">TAX INVOICE</h2>
            <p className="text-sm text-gray-600 mt-1">{invoiceNumber}</p>
          </div>
        </div>

        {/* Bill To + Invoice Info */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Bill To</h3>
            <p className="font-semibold text-lg">{clientName}</p>
            {clientName.toUpperCase().includes('EFEX') && (
              <p className="text-sm text-gray-600">ABN: 28 625 658 568</p>
            )}
          </div>
          <div className="text-right">
            <div className="space-y-1 text-sm">
              <p><span className="text-gray-500">Invoice Date:</span> {invoiceDate}</p>
              <p><span className="text-gray-500">Period:</span> {periodStr}</p>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="w-full mb-6 text-sm">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-2 font-semibold">Description</th>
              <th className="text-center py-2 font-semibold w-16">Qty</th>
              <th className="text-right py-2 font-semibold w-28">Unit Price</th>
              <th className="text-right py-2 font-semibold w-28">Total</th>
            </tr>
          </thead>
          <tbody>
            {/* Run Ups */}
            {runups.length > 0 && (
              <>
                <tr>
                  <td colSpan={4} className="pt-4 pb-1 font-bold text-gray-700">Run Ups</td>
                </tr>
                {runups.map((j) => {
                  const price = (j as { runup_details?: { unit_price?: number | null } | null }).runup_details?.unit_price ?? 0
                  return (
                    <tr key={j.id} className="border-b border-gray-200">
                      <td className="py-1.5">
                        Run Up - {(j as { end_customers?: { name: string } | null }).end_customers?.name ?? j.serial_number ?? j.job_number}
                      </td>
                      <td className="text-center py-1.5">1</td>
                      <td className="text-right py-1.5">{formatCurrency(price)}</td>
                      <td className="text-right py-1.5">{formatCurrency(price)}</td>
                    </tr>
                  )
                })}
              </>
            )}

            {/* Delivery + Collection */}
            {deliveries.length > 0 && (
              <>
                <tr>
                  <td colSpan={4} className="pt-4 pb-1 font-bold text-gray-700">Delivery &amp; Collection</td>
                </tr>
                {deliveries.map((j) => {
                  const price = (j as { delivery_details?: { base_price?: number | null } | null }).delivery_details?.base_price ?? 0
                  return (
                    <tr key={j.id} className="border-b border-gray-200">
                      <td className="py-1.5">
                        {j.job_type === 'collection' ? 'Collection' : 'Delivery'} - {(j as { end_customers?: { name: string } | null }).end_customers?.name ?? j.job_number}
                      </td>
                      <td className="text-center py-1.5">1</td>
                      <td className="text-right py-1.5">{formatCurrency(price)}</td>
                      <td className="text-right py-1.5">{formatCurrency(price)}</td>
                    </tr>
                  )
                })}
              </>
            )}

            {/* Fuel Surcharge */}
            {fuelSurcharge > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5">Fuel Surcharge (11%)</td>
                <td className="text-center py-1.5">1</td>
                <td className="text-right py-1.5">{formatCurrency(fuelSurcharge)}</td>
                <td className="text-right py-1.5">{formatCurrency(fuelSurcharge)}</td>
              </tr>
            )}

            {/* Installs */}
            {installs.length > 0 && (
              <>
                <tr>
                  <td colSpan={4} className="pt-4 pb-1 font-bold text-gray-700">Install</td>
                </tr>
                {installs.map((j) => {
                  const price = (j as { install_details?: { unit_price?: number | null } | null }).install_details?.unit_price ?? 0
                  return (
                    <tr key={j.id} className="border-b border-gray-200">
                      <td className="py-1.5">
                        Install - {(j as { end_customers?: { name: string } | null }).end_customers?.name ?? j.job_number}
                      </td>
                      <td className="text-center py-1.5">1</td>
                      <td className="text-right py-1.5">{formatCurrency(price)}</td>
                      <td className="text-right py-1.5">{formatCurrency(price)}</td>
                    </tr>
                  )
                })}
              </>
            )}

            {/* Storage + Misc */}
            {others.length > 0 && (
              <>
                <tr>
                  <td colSpan={4} className="pt-4 pb-1 font-bold text-gray-700">Storage &amp; Misc</td>
                </tr>
                {others.map((j) => (
                  <tr key={j.id} className="border-b border-gray-200">
                    <td className="py-1.5">
                      {j.job_type.replace(/_/g, ' ')} - {(j as { end_customers?: { name: string } | null }).end_customers?.name ?? j.job_number}
                    </td>
                    <td className="text-center py-1.5">1</td>
                    <td className="text-right py-1.5">—</td>
                    <td className="text-right py-1.5">—</td>
                  </tr>
                ))}
              </>
            )}

            {/* Discount */}
            {discount > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 text-red-600">Discount</td>
                <td className="text-center py-1.5"></td>
                <td className="text-right py-1.5"></td>
                <td className="text-right py-1.5 text-red-600">-{formatCurrency(discount)}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64">
            <div className="flex justify-between py-1 text-sm">
              <span className="text-gray-600">Subtotal</span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between py-1 text-sm">
              <span className="text-gray-600">GST (10%)</span>
              <span className="font-medium">{formatCurrency(gst)}</span>
            </div>
            <div className="flex justify-between py-2 border-t-2 border-gray-800 text-lg font-bold mt-1">
              <span>Grand Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-gray-300 text-xs text-gray-500 text-center">
          <p>Honor Removals &amp; Logistics Pty Ltd | ABN 87 628 874 881</p>
        </div>
      </div>
    </>
  )
}
