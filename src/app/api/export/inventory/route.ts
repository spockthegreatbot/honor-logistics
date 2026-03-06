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

  const { data: items } = await supabase
    .from('inventory')
    .select('*')
    .order('inwards_date', { ascending: false })

  const today = new Date()
  const header = 'Serial Number,Model,Location,Date In,Days In Storage,Active'
  const rows = (items ?? []).map((item) => {
    let days: number | string = ''
    if (item.inwards_date) {
      days = Math.floor((today.getTime() - new Date(item.inwards_date).getTime()) / (1000 * 60 * 60 * 24))
    }
    return [
      item.serial_number,
      item.description,
      item.location,
      item.inwards_date,
      days,
      item.is_active ? 'Yes' : 'No',
    ].map(escapeCsv).join(',')
  })

  const csv = [header, ...rows].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="honor-inventory.csv"',
    },
  })
}
