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

  const clientName = (cycle as { clients?: { name: string } | null }).clients?.name ?? 'Client'

  const totalRunup = cycle.total_runup ?? 0
  const totalDelivery = cycle.total_delivery ?? 0
  const totalFuelSurcharge = cycle.total_fuel_surcharge ?? 0
  const totalInstall = cycle.total_install ?? 0
  const totalStorage = cycle.total_storage ?? 0
  const discount = cycle.discount_amount ?? 0
  const subtotal = cycle.subtotal ?? 0
  const gst = cycle.gst_amount ?? (subtotal * 0.1)
  const grandTotal = cycle.grand_total ?? (subtotal + gst)

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
            {totalRunup > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5">Machine Run Ups</td>
                <td className="text-center py-1.5">1</td>
                <td className="text-right py-1.5">{formatCurrency(totalRunup)}</td>
                <td className="text-right py-1.5">{formatCurrency(totalRunup)}</td>
              </tr>
            )}
            {totalDelivery > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5">Delivery &amp; Collection</td>
                <td className="text-center py-1.5">1</td>
                <td className="text-right py-1.5">{formatCurrency(totalDelivery)}</td>
                <td className="text-right py-1.5">{formatCurrency(totalDelivery)}</td>
              </tr>
            )}
            {totalFuelSurcharge > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5 pl-6 text-gray-600">Fuel Surcharge (11%)</td>
                <td className="text-center py-1.5">1</td>
                <td className="text-right py-1.5">{formatCurrency(totalFuelSurcharge)}</td>
                <td className="text-right py-1.5">{formatCurrency(totalFuelSurcharge)}</td>
              </tr>
            )}
            {totalInstall > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5">Machine Install</td>
                <td className="text-center py-1.5">1</td>
                <td className="text-right py-1.5">{formatCurrency(totalInstall)}</td>
                <td className="text-right py-1.5">{formatCurrency(totalInstall)}</td>
              </tr>
            )}
            {totalStorage > 0 && (
              <tr className="border-b border-gray-200">
                <td className="py-1.5">Storage + Misc</td>
                <td className="text-center py-1.5">1</td>
                <td className="text-right py-1.5">{formatCurrency(totalStorage)}</td>
                <td className="text-right py-1.5">{formatCurrency(totalStorage)}</td>
              </tr>
            )}
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
