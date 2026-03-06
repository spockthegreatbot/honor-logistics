import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .order('name')
  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
