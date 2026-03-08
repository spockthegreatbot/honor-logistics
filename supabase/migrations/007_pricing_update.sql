-- ============================================================
-- 007_pricing_update.sql
-- Pricing rules update for FY 2025-2026
--   1. Fix wrong price: Collection Only - A3 → $165.00
--   2. Restructure Toner Pack & Ship (flat $4.30 → 3-part pricing)
--   3. Add 50+ missing line items across all job types
--   4. Schema additions: crew_size (text nullable), note (text nullable)
--   5. Expand job_type CHECK constraint to include 'relocation'
-- ============================================================

-- ── 1. Schema changes ─────────────────────────────────────────────────────────

-- Drop and recreate the job_type check constraint to add 'relocation'
ALTER TABLE pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_job_type_check;

ALTER TABLE pricing_rules
  ADD CONSTRAINT pricing_rules_job_type_check
  CHECK (job_type IN (
    'runup','install','delivery','collection',
    'storage','toner','inwards','outwards','misc','relocation'
  ));

-- Add crew_size column (nullable) — used for 1 Man / 2 Man rate variants
ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS crew_size TEXT;

-- Add note column (nullable) — for pricing annotations
ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS note TEXT;

-- ── 2. Fix wrong price ────────────────────────────────────────────────────────

UPDATE pricing_rules
SET unit_price = 165.00
WHERE line_item_name = 'Collection Only - A3'
  AND financial_year = '2025-2026';

-- ── 3. Restructure Toner pricing ──────────────────────────────────────────────
-- Remove the old flat $4.30 "Toner Pack & Ship" line
DELETE FROM pricing_rules
WHERE line_item_name = 'Toner Pack & Ship'
  AND financial_year = '2025-2026';

-- Replace with 3-part breakdown
INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable) VALUES
  ('2025-2026', 'toner', null, 'Toner Handling Fee', 2.50, 'per_order', false),
  ('2025-2026', 'toner', null, 'Toner Picking',      0.60, 'per_item',  false),
  ('2025-2026', 'toner', null, 'Toner Packaging',    1.20, 'per_item',  false);

-- ── 4. Add missing pricing rows ───────────────────────────────────────────────

-- ── Run Up ───────────────────────────────────────────────────────────────────
INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable) VALUES
  ('2025-2026', 'runup', 'A3_LARGE', 'LARGE A3 Run-Up', 220.00, 'per_job', false);

-- ── Install ───────────────────────────────────────────────────────────────────
INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable, note) VALUES
  ('2025-2026', 'install', 'A3_LARGE', 'Install A3 LARGE',   275.00, 'per_job',    false, null),
  ('2025-2026', 'install', null,       'Fiery',               220.00, 'per_job',    false, null),
  ('2025-2026', 'install', null,       'Futile (Install)',     72.50, 'per_job',    false, null),
  ('2025-2026', 'install', null,       'Install 2',           165.00, 'per_job',    false, null),
  ('2025-2026', 'install', null,       'Install 5+',          137.50, 'per_job',    false, null),
  ('2025-2026', 'install', null,       'Extra Time Install',   30.00, 'per_15min',  false, 'after 1st hour');

-- ── Delivery — Area 1 (Metro) ─────────────────────────────────────────────────
INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable) VALUES
  ('2025-2026', 'delivery', null, 'A4 SFP - A1',       90.00, 'per_job', true),
  ('2025-2026', 'delivery', null, 'A4 MFD - A1',      110.00, 'per_job', true),
  ('2025-2026', 'delivery', null, 'A3 - A1',          165.00, 'per_job', true),
  ('2025-2026', 'delivery', null, 'A3 LARGE - A1',    185.00, 'per_job', true),
  ('2025-2026', 'delivery', null, 'Finisher Only - A1', 93.50, 'per_job', true);

-- ── Delivery — Area 2 (Outer Metro / Regional) ───────────────────────────────
INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable) VALUES
  ('2025-2026', 'delivery', null, 'A4 SFP - A2',       121.00, 'per_job', true),
  ('2025-2026', 'delivery', null, 'A4 MFD - A2',       140.00, 'per_job', true),
  ('2025-2026', 'delivery', null, 'A3 - A2',           200.00, 'per_job', true),
  ('2025-2026', 'delivery', null, 'A3 LARGE - A2',     220.00, 'per_job', true),
  ('2025-2026', 'delivery', null, 'Finisher Only - A2', 130.00, 'per_job', true);

-- ── Collection ────────────────────────────────────────────────────────────────
INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable, note) VALUES
  ('2025-2026', 'collection', null, 'Collection Only - Large A3',   180.00, 'per_job', true,  null),
  ('2025-2026', 'collection', null, 'Collection Only - A4 SFP',      90.00, 'per_job', true,  null),
  ('2025-2026', 'collection', null, 'Collection Only - A4 MFP',     110.00, 'per_job', true,  null),
  ('2025-2026', 'collection', null, 'Collection on Delivery - A3',  110.00, 'per_job', true,  null),
  ('2025-2026', 'collection', null, 'Collection on Delivery - A4',   82.50, 'per_job', true,  null),
  ('2025-2026', 'collection', null, 'Collection Toners',             13.00, 'per_job', true,  'plus $2.50 per toner'),
  ('2025-2026', 'collection', null, 'Collection / Drop off Parts',   55.00, 'per_job', true,  null);

-- ── Delivery — Disposal / Other ───────────────────────────────────────────────
INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable) VALUES
  ('2025-2026', 'delivery', null, 'Recycling/Dispose - A4',           22.00, 'per_job',  true),
  ('2025-2026', 'delivery', null, 'Recycling/Dispose - Part',         22.00, 'per_job',  true),
  ('2025-2026', 'delivery', null, 'Truck load to recycling/scrap',   275.00, 'per_job',  true),
  ('2025-2026', 'delivery', null, 'Stairs',                           77.00, 'per_job',  true),
  ('2025-2026', 'delivery', null, 'Futile (onsite)',                  75.00, 'per_job',  true);

-- ── Hourly / Km rates (crew_size distinguishes 1 Man vs 2 Man) ───────────────
INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable, crew_size) VALUES
  ('2025-2026', 'delivery', null, 'Hourly Rate 1 Man',          140.00, 'per_hour', true, '1'),
  ('2025-2026', 'delivery', null, 'Hourly Rate 2 Man',          160.00, 'per_hour', true, '2'),
  ('2025-2026', 'delivery', null, 'Km Rate 1 Man (Regional)',     2.10, 'per_km',   true, '1'),
  ('2025-2026', 'delivery', null, 'Km Rate 2 Man (Regional)',     2.31, 'per_km',   true, '2');

-- ── Relocation — Plug & Test ─────────────────────────────────────────────────
INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable) VALUES
  ('2025-2026', 'relocation', null, 'Relocation + Plug & Test - Onsite A4 - A1',  121.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Plug & Test - Onsite A3 - A1',  200.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Plug & Test - Onsite A4 - A2',  140.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Plug & Test - Onsite A3 - A2',  220.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Plug & Test - New Site A4 - A1',210.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Plug & Test - New Site A3 - A1',305.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Plug & Test - New Site A4 - A2',220.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Plug & Test - New Site A3 - A2',345.00, 'per_job', true);

-- ── Relocation + Install ─────────────────────────────────────────────────────
INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable) VALUES
  ('2025-2026', 'relocation', null, 'Relocation + Install - Onsite A4 SFP - A1', 275.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - Onsite A4 MFP - A1', 305.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - Onsite A3 - A1',     320.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - A4 SFP - A1',        350.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - A4 MFP - A1',        360.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - A3 - A1',            420.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - Onsite A4 SFP - A2', 310.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - Onsite A4 MFP - A2', 330.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - Onsite A3 - A2',     355.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - A4 SFP - A2',        375.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - A4 MFP - A2',        420.00, 'per_job', true),
  ('2025-2026', 'relocation', null, 'Relocation + Install - A3 - A2',            450.00, 'per_job', true);
