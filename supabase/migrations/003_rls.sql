-- 003_rls.sql — Enable RLS + authenticated-only policies on all tables
-- Apply manually in Supabase SQL Editor

-- jobs
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON jobs;
CREATE POLICY "authenticated_all" ON jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON clients;
CREATE POLICY "authenticated_all" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- end_customers
ALTER TABLE end_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON end_customers;
CREATE POLICY "authenticated_all" ON end_customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- staff
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON staff;
CREATE POLICY "authenticated_all" ON staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- machines
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON machines;
CREATE POLICY "authenticated_all" ON machines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- pricing_rules
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON pricing_rules;
CREATE POLICY "authenticated_all" ON pricing_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- runup_details
ALTER TABLE runup_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON runup_details;
CREATE POLICY "authenticated_all" ON runup_details FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- install_details
ALTER TABLE install_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON install_details;
CREATE POLICY "authenticated_all" ON install_details FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- delivery_details
ALTER TABLE delivery_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON delivery_details;
CREATE POLICY "authenticated_all" ON delivery_details FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- warehouse_movements
ALTER TABLE warehouse_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON warehouse_movements;
CREATE POLICY "authenticated_all" ON warehouse_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- inventory
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON inventory;
CREATE POLICY "authenticated_all" ON inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- toner_orders
ALTER TABLE toner_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON toner_orders;
CREATE POLICY "authenticated_all" ON toner_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- billing_cycles
ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON billing_cycles;
CREATE POLICY "authenticated_all" ON billing_cycles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- storage_weekly
ALTER TABLE storage_weekly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON storage_weekly;
CREATE POLICY "authenticated_all" ON storage_weekly FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- email_log
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON email_log;
CREATE POLICY "authenticated_all" ON email_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON notifications;
CREATE POLICY "authenticated_all" ON notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- oauth_tokens
ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON oauth_tokens;
CREATE POLICY "authenticated_all" ON oauth_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);
