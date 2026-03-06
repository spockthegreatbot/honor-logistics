import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()

  try {
    const body = await request.json()

    const { data, error } = await supabase
      .from('toner_orders')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error(`PATCH /api/toner/${id} error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
