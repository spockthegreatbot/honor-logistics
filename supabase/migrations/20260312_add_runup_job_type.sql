-- Add 'runup', 'install', 'relocation', and 'misc' to jobs_job_type_check constraint
-- These types are needed for:
--   - runup: Run-up jobs (new board column, arriving tomorrow)
--   - install: Installation jobs
--   - relocation: Relocation jobs
--   - misc: Miscellaneous jobs
--
-- ⚠️  FOR TOLGA TO RUN MANUALLY in Supabase SQL Editor
-- Do NOT auto-apply — review first.

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;

ALTER TABLE jobs ADD CONSTRAINT jobs_job_type_check
  CHECK (job_type IN (
    'runup',
    'install',
    'delivery',
    'collection',
    'storage',
    'toner',
    'toner_ship',
    'inwards',
    'outwards',
    'misc',
    'pickup',
    'relocation'
  ));
