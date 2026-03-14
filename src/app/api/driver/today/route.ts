import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceKey)

  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')

  // Get today's date in AEST (UTC+10)
  const now = new Date()
  const aestDate = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  const todayStr = aestDate.toISOString().slice(0, 10)

  // If name param provided, find matching staff
  let staffIds: string[] | null = null
  if (name) {
    const { data: staff } = await supabase
      .from('staff')
      .select('id')
      .ilike('name', `%${name}%`)

    if (staff && staff.length > 0) {
      staffIds = staff.map(s => s.id)
    } else {
      // No matching driver — return empty
      return NextResponse.json({ jobs: [], date: todayStr, driver: name })
    }
  }

  let query = supabase
    .from('jobs')
    .select('id, job_number, job_type, status, scheduled_date, scheduled_time, client_id, end_customer_id, assigned_to, contact_name, contact_phone, address_to, address_from, order_types, machine_model, serial_number, notes, clients(name, color_code), end_customers(name, address), staff:assigned_to(name)')
    .eq('scheduled_date', todayStr)
    .not('status', 'in', '(cancelled,invoiced)')
    .eq('archived', false)
    .order('scheduled_time', { ascending: true, nullsFirst: false })

  if (staffIds) {
    query = query.in('assigned_to', staffIds)
  }

  const { data: jobs, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ jobs: jobs ?? [], date: todayStr, driver: name })
}
