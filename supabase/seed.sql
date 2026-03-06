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

INSERT INTO pricing_rules (financial_year, job_type, machine_type, line_item_name, unit_price, unit, fuel_applicable) VALUES
('2025-2026','runup','A4_SFP','Machine Run-Up A4 SFP',77.00,'per_job',false),
('2025-2026','runup','A4_MFD','Machine Run-Up A4 MFD',110.00,'per_job',false),
('2025-2026','runup','A3','Machine Run-Up A3',165.00,'per_job',false),
('2025-2026','runup','FIN_ACCESSORIES','Run-Up Fin Accessories',33.00,'per_job',false),
('2025-2026','runup','FINISHER','Run-Up Finisher',66.00,'per_job',false),
('2025-2026','install','A4_SFP','Machine Install A4',165.00,'per_job',false),
('2025-2026','install','A4_MFD','Machine Install A4 MFP',192.50,'per_job',false),
('2025-2026','install','A3','Machine Install A3',220.00,'per_job',false),
('2025-2026','install',null,'PaperCut / FMA Config',110.00,'per_job',false),
('2025-2026','collection','A3','Collection Only - A3',162.00,'per_job',true),
('2025-2026','delivery','FINISHER','Collection/Delivery Finisher',25.00,'per_job',true),
('2025-2026','delivery',null,'Recycling/Dispose - A3',45.00,'per_job',true),
('2025-2026','delivery',null,'Recycling/Dispose - Finisher',16.50,'per_job',true),
('2025-2026','inwards',null,'Inwards Standard',5.00,'per_job',false),
('2025-2026','inwards',null,'Inwards Container',16.50,'per_job',false),
('2025-2026','outwards',null,'Outwards Standard',5.00,'per_job',false),
('2025-2026','outwards',null,'Outwards Container',16.50,'per_job',false),
('2025-2026','storage',null,'Warehouse Storage',5.00,'per_unit_per_week',false),
('2025-2026','storage',null,'Shelf Storage (flat)',93.50,'per_week',false),
('2025-2026','storage',null,'Storage Flat',35.00,'per_week',false),
('2025-2026','storage',null,'Assessment',55.00,'per_job',false),
('2025-2026','storage',null,'GRA',27.50,'per_job',false),
('2025-2026','storage',null,'Page Count',5.50,'per_job',false),
('2025-2026','storage',null,'RC Work',11.00,'per_job',false),
('2025-2026','toner',null,'Toner Pack & Ship',4.30,'per_order',false),
('2025-2026','toner',null,'Ship + Pack',5.50,'per_order',false),
('2025-2026','toner',null,'Ship + Pack A4',27.50,'per_order',false),
('2025-2026','toner',null,'Ship + Pack A3',55.00,'per_order',false);
