-- EFEX order fields on jobs table
-- order_types replaces single job_type for EFEX client jobs (Delivery/Installation/Pick-Up/Relocation)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS order_types TEXT[] DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_time TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS machine_accessories TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS install_idca BOOLEAN;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address_to TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS address_from TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stair_walker BOOLEAN;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stair_walker_comment TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parking BOOLEAN;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parking_comment TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pickup_model TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pickup_accessories TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pickup_serial TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pickup_disposition TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS special_instructions TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS has_aod BOOLEAN DEFAULT false;
-- aod_pdf_url already exists (added in previous migration) — repurposed for EFEX AOD PDF
-- client_reference already exists — used as EFEX Reference #
