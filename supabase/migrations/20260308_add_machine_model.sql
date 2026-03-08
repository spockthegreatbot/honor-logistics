-- Add machine_model as a proper column (was previously stored in notes as "Machine: X")
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS machine_model TEXT;
