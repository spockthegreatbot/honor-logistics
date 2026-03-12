-- Add packing_list_items JSONB column for storing parsed PDF line items
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS packing_list_items jsonb DEFAULT NULL;

-- Add shipment metadata fields for run-up jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shipment_id text DEFAULT NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS connote text DEFAULT NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ship_date date DEFAULT NULL;

COMMENT ON COLUMN jobs.packing_list_items IS 'Parsed line items from Kyocera packing list PDFs: [{itemCode, description, orderedQty, shippedQty, serialNumbers}]';
COMMENT ON COLUMN jobs.shipment_id IS 'Kyocera shipment ID from packing list';
COMMENT ON COLUMN jobs.connote IS 'Consignment note number from packing list';
COMMENT ON COLUMN jobs.ship_date IS 'Ship date from packing list';
