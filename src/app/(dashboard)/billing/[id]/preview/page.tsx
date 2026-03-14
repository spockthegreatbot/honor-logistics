import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { PrintButton } from './PrintButton'

interface PageProps {
  params: Promise<{ id: string }>
}

interface LineItem {
  id: string
  sheet_type: string | null
  job_date: string | null
  customer: string | null
  model: string | null
  serial: string | null
  action: string | null
  qty: number | null
  price_ex: number | null
  fuel_surcharge: number | null
  total_ex: number | null
  notes: string | null
}

function formatCurrency(val: number | null) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(val ?? 0)
}

function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatShortDate(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// Detect client type from name
function getClientType(name: string): 'efex' | 'axus' | 'monthly' {
  const upper = name.toUpperCase()
  if (upper.includes('EFEX')) return 'efex'
  if (upper.includes('AXUS')) return 'axus'
  return 'monthly' // Evolved Digital, Fuji Solutions, Mitronics, etc.
}

// EFEX invoice — original format with summary totals
function EfexInvoice({ cycle, clientName, invoiceNumber, invoiceDate, periodStr }: {
  cycle: Record<string, unknown>
  clientName: string
  invoiceNumber: string
  invoiceDate: string
  periodStr: string
}) {
  const totalRunup = (cycle.total_runup as number) ?? 0
  const totalDelivery = (cycle.total_delivery as number) ?? 0
  const totalFuelSurcharge = (cycle.total_fuel_surcharge as number) ?? 0
  const totalInstall = (cycle.total_install as number) ?? 0
  const totalStorage = (cycle.total_storage as number) ?? 0
  const discount = (cycle.discount_amount as number) ?? 0
  const subtotal = (cycle.subtotal as number) ?? 0
  const gst = (cycle.gst_amount as number) ?? (subtotal * 0.1)
  const grandTotal = (cycle.grand_total as number) ?? (subtotal + gst)

  return (
    <>
      <InvoiceHeader clientName={clientName} invoiceNumber={invoiceNumber} invoiceDate={invoiceDate} periodStr={periodStr} />

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

      <TotalsBlock subtotal={subtotal} gst={gst} grandTotal={grandTotal} />
    </>
  )
}

// Monthly clients (Evolved Digital, Fuji Solutions, Mitronics) — grouped by sheet_type
function MonthlyInvoice({ clientName, invoiceNumber, invoiceDate, periodStr, lineItems, cycle }: {
  clientName: string
  invoiceNumber: string
  invoiceDate: string
  periodStr: string
  lineItems: LineItem[]
  cycle: Record<string, unknown>
}) {
  const sections: Record<string, { label: string; items: LineItem[] }> = {}

  const sectionLabels: Record<string, string> = {
    runup: 'Run Up',
    install: 'Install',
    delivery: 'Delivery & Collection',
    inwards_outwards: 'Delivery & Collection',
    storage: 'Storage',
    toner: 'Toner',
  }

  for (const item of lineItems) {
    const type = item.sheet_type ?? 'other'
    const key = type === 'inwards_outwards' ? 'delivery' : type
    if (!sections[key]) {
      sections[key] = { label: sectionLabels[key] ?? key, items: [] }
    }
    sections[key].items.push(item)
  }

  const sectionOrder = ['runup', 'install', 'delivery', 'storage', 'toner']
  const orderedSections = sectionOrder
    .filter(k => sections[k]?.items.length)
    .map(k => ({ key: k, ...sections[k] }))

  // If no line items, fall back to summary totals
  if (orderedSections.length === 0) {
    return <EfexInvoice cycle={cycle} clientName={clientName} invoiceNumber={invoiceNumber} invoiceDate={invoiceDate} periodStr={periodStr} />
  }

  let grandSubtotal = 0

  return (
    <>
      <InvoiceHeader clientName={clientName} invoiceNumber={invoiceNumber} invoiceDate={invoiceDate} periodStr={periodStr} />

      {orderedSections.map(section => {
        const sectionTotal = section.items.reduce((s, i) => s + (i.total_ex ?? 0), 0)
        grandSubtotal += sectionTotal
        const showQty = section.key !== 'install'

        return (
          <div key={section.key} className="mb-6">
            <h3 className="text-sm font-bold uppercase text-gray-700 border-b border-gray-400 pb-1 mb-2">{section.label}</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-1 font-semibold w-20">Date</th>
                  <th className="text-left py-1 font-semibold">Customer</th>
                  <th className="text-left py-1 font-semibold">Model</th>
                  <th className="text-left py-1 font-semibold w-24">Serial</th>
                  <th className="text-left py-1 font-semibold">Action</th>
                  {showQty && <th className="text-center py-1 font-semibold w-10">Qty</th>}
                  <th className="text-right py-1 font-semibold w-20">Price Ex</th>
                  <th className="text-right py-1 font-semibold w-20">Total Ex</th>
                </tr>
              </thead>
              <tbody>
                {section.items.map(item => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-1">{formatShortDate(item.job_date)}</td>
                    <td className="py-1">{item.customer || '—'}</td>
                    <td className="py-1">{item.model || '—'}</td>
                    <td className="py-1">{item.serial || '—'}</td>
                    <td className="py-1">{item.action || '—'}</td>
                    {showQty && <td className="py-1 text-center">{item.qty ?? '—'}</td>}
                    <td className="py-1 text-right">{item.price_ex != null ? formatCurrency(item.price_ex) : '—'}</td>
                    <td className="py-1 text-right">{item.total_ex != null ? formatCurrency(item.total_ex) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-400">
                  <td colSpan={showQty ? 7 : 6} className="py-1 text-right text-xs font-semibold text-gray-600">Section Subtotal</td>
                  <td className="py-1 text-right font-semibold">{formatCurrency(sectionTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      })}

      <TotalsBlock
        subtotal={grandSubtotal}
        gst={grandSubtotal * 0.1}
        grandTotal={grandSubtotal * 1.1}
      />
    </>
  )
}

// AXUS invoice — summary table
function AxusInvoice({ invoiceNumber, invoiceDate, periodStr, lineItems, cycle }: {
  invoiceNumber: string
  invoiceDate: string
  periodStr: string
  lineItems: LineItem[]
  cycle: Record<string, unknown>
}) {
  const summaryItems = lineItems.filter(i => i.sheet_type === 'summary')

  // If no summary line items, fall back to all line items
  const displayItems = summaryItems.length > 0 ? summaryItems : lineItems

  // If still empty, use cycle totals
  if (displayItems.length === 0) {
    return <EfexInvoice cycle={cycle} clientName="AXUS" invoiceNumber={invoiceNumber} invoiceDate={invoiceDate} periodStr={periodStr} />
  }

  const subtotal = displayItems.reduce((s, i) => s + (i.total_ex ?? 0), 0)
  const gst = subtotal * 0.1
  const grandTotal = subtotal + gst

  return (
    <>
      <InvoiceHeader clientName="AXUS" invoiceNumber={invoiceNumber} invoiceDate={invoiceDate} periodStr={periodStr} />

      <table className="w-full mb-6 text-sm">
        <thead>
          <tr className="border-b-2 border-gray-800">
            <th className="text-left py-2 font-semibold">Type</th>
            <th className="text-center py-2 font-semibold w-16">QTY</th>
            <th className="text-right py-2 font-semibold w-28">Cost Ex</th>
            <th className="text-right py-2 font-semibold w-28">Total Ex</th>
          </tr>
        </thead>
        <tbody>
          {displayItems.map(item => (
            <tr key={item.id} className="border-b border-gray-200">
              <td className="py-1.5">{item.action || item.customer || item.notes || '—'}</td>
              <td className="text-center py-1.5">{item.qty ?? 1}</td>
              <td className="text-right py-1.5">{item.price_ex != null ? formatCurrency(item.price_ex) : '—'}</td>
              <td className="text-right py-1.5">{item.total_ex != null ? formatCurrency(item.total_ex) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <TotalsBlock subtotal={subtotal} gst={gst} grandTotal={grandTotal} />
    </>
  )
}

// Shared components
function InvoiceHeader({ clientName, invoiceNumber, invoiceDate, periodStr }: {
  clientName: string; invoiceNumber: string; invoiceDate: string; periodStr: string
}) {
  return (
    <>
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
    </>
  )
}

function TotalsBlock({ subtotal, gst, grandTotal }: { subtotal: number; gst: number; grandTotal: number }) {
  return (
    <>
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

      <div className="mt-12 pt-4 border-t border-gray-300 text-xs text-gray-500 text-center">
        <p>Honor Removals &amp; Logistics Pty Ltd | ABN 87 628 874 881</p>
      </div>
    </>
  )
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
  const clientType = getClientType(clientName)

  const invoiceNumber = cycle.xero_invoice_number ?? cycle.cycle_name ?? `INV-${id.slice(0, 6).toUpperCase()}`
  const invoiceDate = formatDate(cycle.period_end)
  const periodStr = `${formatDate(cycle.period_start)} - ${formatDate(cycle.period_end)}`

  // Fetch line items for non-EFEX invoices
  let lineItems: LineItem[] = []
  if (clientType !== 'efex') {
    const { data: items } = await supabase
      .from('billing_line_items')
      .select('*')
      .eq('billing_cycle_id', id)
      .order('job_date', { ascending: true })

    lineItems = (items ?? []) as LineItem[]
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
      <div className="min-h-screen bg-white text-black p-8 max-w-4xl mx-auto print:p-4">
        <div className="no-print mb-6 flex justify-end">
          <PrintButton />
        </div>

        {clientType === 'efex' && (
          <EfexInvoice
            cycle={cycle as Record<string, unknown>}
            clientName={clientName}
            invoiceNumber={invoiceNumber}
            invoiceDate={invoiceDate}
            periodStr={periodStr}
          />
        )}

        {clientType === 'axus' && (
          <AxusInvoice
            invoiceNumber={invoiceNumber}
            invoiceDate={invoiceDate}
            periodStr={periodStr}
            lineItems={lineItems}
            cycle={cycle as Record<string, unknown>}
          />
        )}

        {clientType === 'monthly' && (
          <MonthlyInvoice
            clientName={clientName}
            invoiceNumber={invoiceNumber}
            invoiceDate={invoiceDate}
            periodStr={periodStr}
            lineItems={lineItems}
            cycle={cycle as Record<string, unknown>}
          />
        )}
      </div>
    </>
  )
}
