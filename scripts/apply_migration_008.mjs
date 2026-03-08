import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://ablgxcbebsdsdocmffyk.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibGd4Y2JlYnNkc2RvY21mZnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjc2MjEwMywiZXhwIjoyMDg4MzM4MTAzfQ.zQ77U5Fe_-wo0-RWNdQLEhScUsX_FdSGIN_B5ZdqZYY';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Read the migration SQL
const sql = readFileSync('./supabase/migrations/008_recalculate_billing_totals.sql', 'utf8');

console.log('Applying migration 008 via Supabase RPC...');

// Try the exec_sql RPC first
const { data, error } = await supabase.rpc('exec_sql', { sql });

if (error) {
  console.error('exec_sql RPC failed:', error.message, '— trying direct HTTP...');

  // Fall back: POST to the SQL endpoint used by Supabase management
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  });
  const text = await res.text();
  console.log('Direct HTTP response:', res.status, text);
} else {
  console.log('Migration applied! Response:', data);
}
