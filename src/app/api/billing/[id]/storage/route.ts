import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { week_label, storage_type, qty, cost_ex, notes } = body

    const total_ex = (qty || 0) * (cost_ex || 0)

    const { data, error } = await supabase
      .from('storage_weekly')
      .insert({
        billing_cycle_id: id,
        week_label: week_label || null,
        storage_type: storage_type || null,
        qty: qty || 1,
        cost_ex: cost_ex || 0,
        total_ex,
        notes: notes || null,
        auto_populated: false,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error(`POST /api/billing/${id}/storage error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const storageId = searchParams.get('storage_id')

  if (!storageId) return NextResponse.json({ error: 'storage_id required' }, { status: 400 })

  const { error } = await supabase
    .from('storage_weekly')
    .delete()
    .eq('id', storageId)
    .eq('billing_cycle_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
