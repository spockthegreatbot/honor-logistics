import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

export async function GET(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const fy = searchParams.get('fy')

  let query = supabase
    .from('pricing_rules')
    .select('*', { count: 'exact' })
    .order('job_type')
    .order('line_item_name')

  if (fy && fy !== 'all') query = query.eq('financial_year', fy)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], count })
}

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  try {
    const body = await request.json()
    const { financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable } = body

    if (!financial_year || !job_type || !line_item_name || unit_price === undefined) {
      return NextResponse.json({ error: 'financial_year, job_type, line_item_name, unit_price required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('pricing_rules')
      .insert({
        financial_year,
        job_type,
        machine_type: machine_type || null,
        line_item_name,
        unit_price,
        unit: unit || null,
        fuel_applicable: fuel_applicable ?? false,
        is_active: true,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('POST /api/settings/pricing error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
