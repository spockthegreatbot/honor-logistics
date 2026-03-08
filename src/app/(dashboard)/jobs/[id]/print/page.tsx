import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

const ORDER_TYPE_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  installation: 'Installation',
  pickup: 'Pick-Up',
  relocation: 'Relocation',
}

function yn(v: boolean | null | undefined) {
  if (v === true) return 'YES'
  if (v === false) return 'NO'
  return '—'
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <tr>
      <td style={{ width: 160, padding: '4px 8px', fontWeight: 600, color: '#444', fontSize: 11, verticalAlign: 'top', borderRight: '1px solid #e0e0e0', background: '#f8f8f8' }}>
        {label}
      </td>
      <td style={{ padding: '4px 8px', fontSize: 12, color: '#111', verticalAlign: 'top' }}>
        {value || '—'}
      </td>
    </tr>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ background: '#2d3748', color: 'white', padding: '4px 10px', fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', borderRadius: '4px 4px 0 0' }}>
        {title}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e0e0e0', borderTop: 'none' }}>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export default async function PrintJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: job } = await supabase
    .from('jobs')
    .select(`
      *, clients(name), end_customers(name, address),
      staff:assigned_to(name), machines(make, model)
    `)
    .eq('id', id)
    .single()

  if (!job) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = job as any

  const clientName = j.clients?.name ?? '—'
  const endCustomerName = j.end_customers?.name ?? '—'
  const staffName = j.staff?.name ?? 'Unassigned'
  const machineModel = j.machines?.model ?? j.machine_model ?? '—'
  const EFEX_TYPES = ['delivery', 'installation', 'pickup', 'relocation']
  const orderTypes: string[] = (j.order_types && j.order_types.length > 0)
    ? j.order_types
    : (EFEX_TYPES.includes(j.job_type) ? [j.job_type] : [])
  const orderLabel = orderTypes.length > 0
    ? orderTypes.map((t: string) => ORDER_TYPE_LABELS[t] ?? t).join(' + ')
    : j.job_type

  const hasDel = orderTypes.includes('delivery') || orderTypes.includes('installation')
  const hasRel = orderTypes.includes('relocation')
  const hasPick = orderTypes.includes('pickup')

  const scheduledDate = j.scheduled_date
    ? new Date(j.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Job Card — {j.job_number ?? id}</title>
        <style>{`
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 20px; background: white; color: #111; }
          @media print {
            body { padding: 10px; }
            .no-print { display: none !important; }
            @page { margin: 12mm; }
          }
          .print-btn { background:#2d3748;color:white;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;margin-bottom:16px; }
        `}</style>
      </head>
      <body>
        {/* Print button — hidden in print */}
        <div className="no-print" style={{ marginBottom: 16 }}>
          <button className="print-btn">🖨 Print / Save PDF</button>
        </div>
        <script dangerouslySetInnerHTML={{ __html: 'document.querySelector(".print-btn").onclick=()=>window.print(); window.onload=()=>window.print();' }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, borderBottom: '2px solid #2d3748', paddingBottom: 10 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#2d3748', letterSpacing: -0.5 }}>HONOR REMOVALS &amp; LOGISTICS</div>
            <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>Job Card — Pick Up / Delivery / Install Request</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#e85d00', letterSpacing: 1 }}>{j.job_number ?? id}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>automation@honorremovals.com.au</div>
          </div>
        </div>

        {/* Order type checkboxes — matches EFEX form layout */}
        <div style={{ display: 'flex', gap: 24, marginBottom: 14, padding: '8px 12px', border: '1px solid #e0e0e0', borderRadius: 4, background: '#f8f8f8' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#444', marginRight: 8, alignSelf: 'center' }}>ORDER TYPE:</span>
          {['delivery', 'installation', 'pickup', 'relocation'].map(t => (
            <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: orderTypes.includes(t) ? 700 : 400, color: orderTypes.includes(t) ? '#111' : '#888' }}>
              <span style={{ display: 'inline-block', width: 13, height: 13, border: '1.5px solid #666', borderRadius: 2, background: orderTypes.includes(t) ? '#2d3748' : 'white', marginRight: 2, verticalAlign: 'middle' }}>
                {orderTypes.includes(t) && <span style={{ color: 'white', fontSize: 10, lineHeight: '13px', display: 'block', textAlign: 'center' }}>✓</span>}
              </span>
              {ORDER_TYPE_LABELS[t]}
            </label>
          ))}
        </div>

        {/* Job Details */}
        <Section title="Job Details">
          <Row label="Client" value={clientName} />
          <Row label="End Customer" value={endCustomerName} />
          <Row label="EFEX Reference #" value={j.client_reference} />
          <Row label="Delivery Date" value={scheduledDate} />
          <Row label="Time" value={j.scheduled_time} />
          <Row label="Best Contact" value={j.contact_name} />
          <Row label="Phone" value={j.contact_phone} />
          <Row label="Assigned To" value={staffName} />
          {j.has_aod !== null && j.has_aod !== undefined && (
            <Row label="AOD Required" value={j.has_aod ? '✓ YES — EFEX AOD PDF to be printed & signed' : 'NO'} />
          )}
        </Section>

        {/* Machine Details */}
        <Section title="Machine Details">
          <Row label="Model / Part #" value={machineModel} />
          <Row label="Accessories" value={j.machine_accessories} />
          <Row label="Serial #" value={j.serial_number} />
          {hasDel && <Row label="Install IDCA" value={j.install_idca === true ? 'YES' : j.install_idca === false ? 'NO' : '—'} />}
        </Section>

        {/* Address & Site */}
        {(hasDel || hasRel) && (
          <Section title={hasRel ? 'Relocation Addresses' : 'Delivery Address & Site'}>
            {hasRel && <Row label="Address FROM" value={j.address_from} />}
            <Row label={hasRel ? 'Address TO' : 'Address'} value={j.address_to ?? j.end_customers?.address} />
            <Row label="Stair Walker" value={`${yn(j.stair_walker)}${j.stair_walker_comment ? ' — ' + j.stair_walker_comment : ''}`} />
            <Row label="Parking" value={`${yn(j.parking)}${j.parking_comment ? ' — ' + j.parking_comment : ''}`} />
          </Section>
        )}

        {/* Pick-Up */}
        {hasPick && (
          <Section title="Pick-Up Details">
            <Row label="Pick-Up Model" value={j.pickup_model} />
            <Row label="Pick-Up Accessories" value={j.pickup_accessories} />
            <Row label="Pick-Up Serial" value={j.pickup_serial} />
            <Row label="Disposition" value={j.pickup_disposition} />
          </Section>
        )}

        {/* Special Instructions */}
        {j.special_instructions && (
          <Section title="Special Instructions">
            <tr>
              <td colSpan={2} style={{ padding: '8px 10px', fontSize: 12, color: '#111', whiteSpace: 'pre-wrap' }}>
                {j.special_instructions}
              </td>
            </tr>
          </Section>
        )}

        {/* Signature block */}
        <div style={{ marginTop: 24, border: '1px solid #e0e0e0', borderRadius: 4, padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 11, color: '#444', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Acknowledgment of Delivery
          </div>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 16 }}>
            I/We accept that the above listed equipment has been received in good working condition &amp; order.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {['Name', 'Signature', 'Date'].map(f => (
              <div key={f}>
                <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>{f}</div>
                <div style={{ borderBottom: '1px solid #333', height: 32 }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, color: '#999' }}>Title / Position Held: ___________________________</div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, paddingTop: 8, borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#999' }}>
          <span>Honor Removals &amp; Logistics · automation@honorremovals.com.au</span>
          <span>Printed: {new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })} AEDT</span>
        </div>
      </body>
    </html>
  )
}
