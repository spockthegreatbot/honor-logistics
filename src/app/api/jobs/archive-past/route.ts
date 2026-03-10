import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

const DONE_STATUSES = ['done', 'complete', 'completed', 'invoiced', 'cancelled']

export async function POST() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

  const { data, error } = await supabase
    .from('jobs')
    .update({ archived: true })
    .lt('scheduled_date', today)
    .eq('archived', false)
    .not('status', 'in', `(${DONE_STATUSES.map(s => `"${s}"`).join(',')})`)
    .select('id')

  if (error) {
    console.error('[archive-past] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ archived: data?.length ?? 0 })
}
