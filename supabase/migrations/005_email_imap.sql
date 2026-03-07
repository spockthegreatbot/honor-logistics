-- Add IMAP-friendly columns to email_log
ALTER TABLE email_log
  ADD COLUMN IF NOT EXISTS direction VARCHAR DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS from_address VARCHAR,
  ADD COLUMN IF NOT EXISTS body_preview TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS raw_message_id VARCHAR;

-- Backfill from_address from from_email if exists
UPDATE email_log SET from_address = from_email WHERE from_address IS NULL AND from_email IS NOT NULL;

-- Index for fast polling
CREATE INDEX IF NOT EXISTS idx_email_log_direction ON email_log(direction);
CREATE INDEX IF NOT EXISTS idx_email_log_client ON email_log(client_id);
CREATE INDEX IF NOT EXISTS idx_email_log_received ON email_log(received_at DESC);
