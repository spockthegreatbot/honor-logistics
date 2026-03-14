import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')

  if (!clientId) {
    return NextResponse.json({ error: 'client_id required' }, { status: 400 })
  }

  const { data: openCycle, error } = await supabase
    .from('billing_cycles')
    .select('id, cycle_name, period_start, period_end')
    .eq('client_id', clientId)
    .eq('status', 'open')
    .order('period_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ cycle: openCycle ?? null })
}
