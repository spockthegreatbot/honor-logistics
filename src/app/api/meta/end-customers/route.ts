import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')

  const supabase = await createClient()
  let query = supabase.from('end_customers').select('id, name, client_id').order('name')
  if (clientId) query = query.eq('client_id', clientId)

  const { data, error } = await query
  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
