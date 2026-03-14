import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

export async function GET(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const group = searchParams.get('group') // active | ready | completed | all

  let query = supabase
    .from('jobs')
    .select(
      '*, clients(name, color_code), end_customers(name), staff:assigned_to(name), runup_details(check_signed_off)',
      { count: 'exact' }
    )
    .eq('job_type', 'runup')
    .order('created_at', { ascending: false })

  switch (group) {
    case 'active':
      // Received/stored, waiting for delivery
      query = query.in('status', ['runup_pending', 'received', 'stored', 'new', 'scheduled'])
      query = query.eq('archived', false)
      break
    case 'ready':
      // Run-up complete, ready for delivery
      query = query.in('status', ['runup_complete', 'ready'])
      query = query.eq('archived', false)
      break
    case 'completed':
      // Delivered / done
      query = query.in('status', ['delivered', 'complete', 'done'])
      break
    default:
      // All non-cancelled runups
      query = query.not('status', 'in', '(cancelled)')
      break
  }

  query = query.range(0, 499)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const res = NextResponse.json({ data: data ?? [], count })
  res.headers.set('Cache-Control', 'private, max-age=5')
  return res
}
