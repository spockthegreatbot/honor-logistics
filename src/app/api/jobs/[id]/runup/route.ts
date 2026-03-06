import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

const RUNUP_PATCH_FIELDS = [
  'check_power_on', 'check_firmware_loaded', 'check_customer_config',
  'check_serial_verified', 'check_test_print', 'check_signed_off',
  'action_type', 'unit_price', 'notes',
]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = await createClient()
    const { id } = await params
    const body = await request.json()

    const update = Object.fromEntries(
      Object.entries(body).filter(([k]) => RUNUP_PATCH_FIELDS.includes(k))
    )

    // Update runup_details for this job
    const { data, error } = await supabase
      .from('runup_details')
      .update(update)
      .eq('job_id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If signing off, also update job status
    if (update.check_signed_off === true) {
      await supabase
        .from('jobs')
        .update({ status: 'runup_complete', updated_at: new Date().toISOString() })
        .eq('id', id)
    }

    return NextResponse.json({ runup: data })
  } catch (err) {
    console.error('PATCH /api/jobs/[id]/runup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
