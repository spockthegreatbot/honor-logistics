import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// One-shot migration endpoint. Call POST /api/migrate?secret=honor-cron-secret
// Adds missing columns to the jobs table by testing each column and adding if absent.
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET ?? 'honor-cron-secret'
  if (secret !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const columns = ['machine_model', 'booking_form_url', 'install_pdf_url']
  const results: Record<string, string> = {}

  for (const col of columns) {
    // Test if column exists by selecting it
    const { error } = await supabase.from('jobs').select(col).limit(1)
    if (error && error.code === '42703') {
      // Column doesn't exist — try adding via RPC (exec_sql) if available
      const { error: rpcErr } = await supabase.rpc('exec_sql', {
        sql: `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ${col} TEXT;`
      })
      if (rpcErr) {
        results[col] = `MISSING — add manually: ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ${col} TEXT;`
      } else {
        results[col] = 'added'
      }
    } else {
      results[col] = 'exists'
    }
  }

  return NextResponse.json({ migration: results })
}
