import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    const body = await request.json()

    // Update runup_details for this job
    const { data, error } = await supabase
      .from('runup_details')
      .update(body)
      .eq('job_id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If signing off, also update job status
    if (body.check_signed_off === true) {
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
