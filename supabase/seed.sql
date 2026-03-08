-- ── Clients ──────────────────────────────────────────────────────────────────
INSERT INTO clients (name, trading_name, abn, billing_email, payment_terms_days, is_primary)
VALUES ('EFEX', 'EFEX', '28 625 658 568', 'accounts@efex.com.au', 30, true);

INSERT INTO clients (name, is_primary) VALUES
  ('NAPS', false),
  ('A E Dunne', false),
  ('Disability Trust', false),
  ('Various/Other', false);

-- ── Staff ─────────────────────────────────────────────────────────────────────
-- Passwords/auth set via Supabase Dashboard → Authentication; auth_user_id linked post-setup.
INSERT INTO staff (name, email, role, is_active) VALUES
  ('Onur Yelkarasi',  'onur@honorlogistics.com.au',   'admin',     true),
  ('Andre Dukino',    'andre@honorlogistics.com.au',   'warehouse', true),
  ('Ugur Nalcakan',   'ugur@honorlogistics.com.au',    'driver',    true),
  ('Banu Yelkarasi',  'banu@honorlogistics.com.au',    'admin',     true);

-- NOTE: seed.sql reflects the state after 007_pricing_update.sql has been applied.
-- Schema additions required first: crew_size (text nullable), note (text nullable),
-- and job_type constraint expanded to include 'relocation' (see migration 007).

INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable, crew_size, note) VALUES

-- ── Run Up ───────────────────────────────────────────────────────────────────
('2025-2026','runup','A4_SFP',     'Machine Run-Up A4 SFP',        77.00,'per_job',false,null,null),
('2025-2026','runup','A4_MFD',     'Machine Run-Up A4 MFD',        110.00,'per_job',false,null,null),
('2025-2026','runup','A3',         'Machine Run-Up A3',            165.00,'per_job',false,null,null),
('2025-2026','runup','FIN_ACCESSORIES','Run-Up Fin Accessories',    33.00,'per_job',false,null,null),
('2025-2026','runup','FINISHER',   'Run-Up Finisher',               66.00,'per_job',false,null,null),
('2025-2026','runup','A3_LARGE',   'LARGE A3 Run-Up',              220.00,'per_job',false,null,null),

-- ── Install ───────────────────────────────────────────────────────────────────
('2025-2026','install','A4_SFP',   'Machine Install A4',           165.00,'per_job',false,null,null),
('2025-2026','install','A4_MFD',   'Machine Install A4 MFP',       192.50,'per_job',false,null,null),
('2025-2026','install','A3',       'Machine Install A3',           220.00,'per_job',false,null,null),
('2025-2026','install','A3_LARGE', 'Install A3 LARGE',             275.00,'per_job',false,null,null),
('2025-2026','install',null,       'PaperCut / FMA Config',        110.00,'per_job',false,null,null),
('2025-2026','install',null,       'Fiery',                        220.00,'per_job',false,null,null),
('2025-2026','install',null,       'Futile (Install)',              72.50,'per_job',false,null,null),
('2025-2026','install',null,       'Install 2',                    165.00,'per_job',false,null,null),
('2025-2026','install',null,       'Install 5+',                   137.50,'per_job',false,null,null),
('2025-2026','install',null,       'Extra Time Install',            30.00,'per_15min',false,null,'after 1st hour'),

-- ── Delivery — Area 1 (Metro) ─────────────────────────────────────────────────
('2025-2026','delivery',null,      'A4 SFP - A1',                   90.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'A4 MFD - A1',                  110.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'A3 - A1',                      165.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'A3 LARGE - A1',                185.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'Finisher Only - A1',            93.50,'per_job',true,null,null),

-- ── Delivery — Area 2 (Outer Metro / Regional) ───────────────────────────────
('2025-2026','delivery',null,      'A4 SFP - A2',                  121.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'A4 MFD - A2',                  140.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'A3 - A2',                      200.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'A3 LARGE - A2',                220.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'Finisher Only - A2',           130.00,'per_job',true,null,null),

-- ── Delivery — Legacy / Other ─────────────────────────────────────────────────
('2025-2026','delivery','FINISHER','Collection/Delivery Finisher',   25.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'Recycling/Dispose - A3',        45.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'Recycling/Dispose - Finisher',  16.50,'per_job',true,null,null),
('2025-2026','delivery',null,      'Recycling/Dispose - A4',        22.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'Recycling/Dispose - Part',      22.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'Truck load to recycling/scrap', 275.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'Stairs',                        77.00,'per_job',true,null,null),
('2025-2026','delivery',null,      'Futile (onsite)',               75.00,'per_job',true,null,null),

-- ── Hourly / Km rates ─────────────────────────────────────────────────────────
('2025-2026','delivery',null,      'Hourly Rate 1 Man',            140.00,'per_hour',true,'1',null),
('2025-2026','delivery',null,      'Hourly Rate 2 Man',            160.00,'per_hour',true,'2',null),
('2025-2026','delivery',null,      'Km Rate 1 Man (Regional)',       2.10,'per_km',  true,'1',null),
('2025-2026','delivery',null,      'Km Rate 2 Man (Regional)',       2.31,'per_km',  true,'2',null),

-- ── Collection ────────────────────────────────────────────────────────────────
('2025-2026','collection','A3',    'Collection Only - A3',         165.00,'per_job',true,null,null),  -- fixed from $162
('2025-2026','collection',null,    'Collection Only - Large A3',   180.00,'per_job',true,null,null),
('2025-2026','collection',null,    'Collection Only - A4 SFP',      90.00,'per_job',true,null,null),
('2025-2026','collection',null,    'Collection Only - A4 MFP',     110.00,'per_job',true,null,null),
('2025-2026','collection',null,    'Collection on Delivery - A3',  110.00,'per_job',true,null,null),
('2025-2026','collection',null,    'Collection on Delivery - A4',   82.50,'per_job',true,null,null),
('2025-2026','collection',null,    'Collection Toners',             13.00,'per_job',true,null,'plus $2.50 per toner'),
('2025-2026','collection',null,    'Collection / Drop off Parts',   55.00,'per_job',true,null,null),

-- ── Inwards / Outwards ────────────────────────────────────────────────────────
('2025-2026','inwards',null,       'Inwards Standard',               5.00,'per_job',false,null,null),
('2025-2026','inwards',null,       'Inwards Container',             16.50,'per_job',false,null,null),
('2025-2026','outwards',null,      'Outwards Standard',              5.00,'per_job',false,null,null),
('2025-2026','outwards',null,      'Outwards Container',            16.50,'per_job',false,null,null),

-- ── Storage ───────────────────────────────────────────────────────────────────
('2025-2026','storage',null,       'Warehouse Storage',              5.00,'per_unit_per_week',false,null,null),
('2025-2026','storage',null,       'Shelf Storage (flat)',          93.50,'per_week',false,null,null),
('2025-2026','storage',null,       'Storage Flat',                  35.00,'per_week',false,null,null),
('2025-2026','storage',null,       'Assessment',                    55.00,'per_job',false,null,null),
('2025-2026','storage',null,       'GRA',                           27.50,'per_job',false,null,null),
('2025-2026','storage',null,       'Page Count',                     5.50,'per_job',false,null,null),
('2025-2026','storage',null,       'RC Work',                       11.00,'per_job',false,null,null),

-- ── Toner (3-part pricing replacing old flat $4.30) ───────────────────────────
('2025-2026','toner',null,         'Toner Handling Fee',             2.50,'per_order',false,null,null),
('2025-2026','toner',null,         'Toner Picking',                  0.60,'per_item', false,null,null),
('2025-2026','toner',null,         'Toner Packaging',                1.20,'per_item', false,null,null),
('2025-2026','toner',null,         'Ship + Pack',                    5.50,'per_order',false,null,null),
('2025-2026','toner',null,         'Ship + Pack A4',                27.50,'per_order',false,null,null),
('2025-2026','toner',null,         'Ship + Pack A3',                55.00,'per_order',false,null,null),

-- ── Relocation — Plug & Test ─────────────────────────────────────────────────
('2025-2026','relocation',null,    'Relocation + Plug & Test - Onsite A4 - A1',   121.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Plug & Test - Onsite A3 - A1',   200.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Plug & Test - Onsite A4 - A2',   140.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Plug & Test - Onsite A3 - A2',   220.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Plug & Test - New Site A4 - A1', 210.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Plug & Test - New Site A3 - A1', 305.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Plug & Test - New Site A4 - A2', 220.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Plug & Test - New Site A3 - A2', 345.00,'per_job',true,null,null),

-- ── Relocation + Install ─────────────────────────────────────────────────────
('2025-2026','relocation',null,    'Relocation + Install - Onsite A4 SFP - A1',   275.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - Onsite A4 MFP - A1',   305.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - Onsite A3 - A1',       320.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - A4 SFP - A1',          350.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - A4 MFP - A1',          360.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - A3 - A1',              420.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - Onsite A4 SFP - A2',   310.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - Onsite A4 MFP - A2',   330.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - Onsite A3 - A2',       355.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - A4 SFP - A2',          375.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - A4 MFP - A2',          420.00,'per_job',true,null,null),
('2025-2026','relocation',null,    'Relocation + Install - A3 - A2',              450.00,'per_job',true,null,null);
