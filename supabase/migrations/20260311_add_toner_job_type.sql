-- Add 'toner' to jobs_job_type_check constraint (required for Axus toner orders)
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_job_type_check
  CHECK (job_type IN ('runup','install','delivery','collection','storage','toner','inwards','outwards','misc','pickup','relocation'));
