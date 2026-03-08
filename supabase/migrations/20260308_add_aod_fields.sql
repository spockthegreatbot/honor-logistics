-- AOD (Acknowledgment of Delivery) fields
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS aod_pdf_url TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS aod_signed_at TIMESTAMPTZ;
