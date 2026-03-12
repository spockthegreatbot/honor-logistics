import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: 'public' } }
  )

  // Create a temporary function to run our DDL
  const createFn = `
    CREATE OR REPLACE FUNCTION _temp_migrate() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS packing_list_items jsonb DEFAULT NULL;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shipment_id text DEFAULT NULL;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS connote text DEFAULT NULL;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ship_date date DEFAULT NULL;
      ALTER TABLE jobs ADD COLUMN IF NOT EXISTS runup_pdf_url text DEFAULT NULL;
    END;
    $$;
  `

  // We can't run DDL via PostgREST directly, so let's use a workaround:
  // Try creating via RPC call, which won't work for DDL...
  // Actually PostgREST won't let us CREATE FUNCTION either.
  
  // Best approach: just try updating a record with the new columns to check if they exist
  // If they don't, return the SQL to run manually
  const { error } = await supabase
    .from('jobs')
    .select('packing_list_items,shipment_id,connote,ship_date,runup_pdf_url')
    .limit(1)

  if (error) {
    return NextResponse.json({
      status: 'columns_missing',
      message: 'Run this SQL in Supabase SQL Editor:',
      sql: [
        'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS packing_list_items jsonb DEFAULT NULL;',
        'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shipment_id text DEFAULT NULL;',
        'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS connote text DEFAULT NULL;',
        'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ship_date date DEFAULT NULL;',
        'ALTER TABLE jobs ADD COLUMN IF NOT EXISTS runup_pdf_url text DEFAULT NULL;',
      ]
    })
  }

  return NextResponse.json({ status: 'ok', message: 'All columns exist' })
}
