-- Add stair_walker and parking fields to delivery_details
ALTER TABLE delivery_details 
  ADD COLUMN IF NOT EXISTS stair_walker BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parking_available BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parking_notes TEXT;

-- Add same to install_details
ALTER TABLE install_details
  ADD COLUMN IF NOT EXISTS stair_walker BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parking_available BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parking_notes TEXT,
  ADD COLUMN IF NOT EXISTS fma_required BOOLEAN DEFAULT FALSE;
