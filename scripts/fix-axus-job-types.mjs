import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: axusClient } = await sb.from('clients').select('id, name').ilike('name', '%axus%').single()
if (!axusClient) { console.log('No Axus client found'); process.exit(1) }
console.log('Axus client:', axusClient.name, axusClient.id)

const { error, data } = await sb.from('jobs')
  .update({ job_type: 'toner', board_column: null })
  .eq('client_id', axusClient.id)
  .select('id, job_number')

if (error) { console.error('Error:', error); process.exit(1) }
console.log(`Updated ${data?.length ?? 0} Axus jobs to job_type=toner`)
data?.forEach(j => console.log(' -', j.job_number))
