-- 004_constraints.sql — Add unique constraint on job_number
-- Apply manually in Supabase SQL Editor

ALTER TABLE jobs ADD CONSTRAINT jobs_job_number_unique UNIQUE (job_number);
