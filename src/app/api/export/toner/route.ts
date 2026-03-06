import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'

function escapeCsv(val: string | number | null | undefined): string {
  if (val == null) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const { data: orders } = await supabase
    .from('toner_orders')
    .select('*')
    .order('created_at', { ascending: false })

  const header = 'Order Date,Supplier,Courier,Tracking,Status,Total Amount'
  const rows = (orders ?? []).map((o) => {
    return [
      o.dispatch_date,
      o.efex_ni,
      o.courier,
      o.tracking_number,
      o.status,
      o.total_price,
    ].map(escapeCsv).join(',')
  })

  const csv = [header, ...rows].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="honor-toner.csv"',
    },
  })
}
