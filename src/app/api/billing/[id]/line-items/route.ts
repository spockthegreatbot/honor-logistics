import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await createClient()

  const { data: items, error } = await supabase
    .from('billing_line_items')
    .select('*')
    .eq('billing_cycle_id', id)
    .order('sheet_type')
    .order('job_date', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: items ?? [] })
}
