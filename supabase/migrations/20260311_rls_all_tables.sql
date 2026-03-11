-- 20260311_rls_all_tables.sql
-- Ensures RLS is enabled on every public table and grants full access to
-- service_role (used by server-side API routes) and authenticated users.
--
-- Run this in Supabase Dashboard > SQL Editor:
-- https://supabase.com/dashboard/project/ablgxcbebsdsdocmffyk/sql

DO $$ BEGIN

-- ── jobs ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.jobs;
CREATE POLICY "Service role full access" ON public.jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.jobs;
CREATE POLICY "Authenticated users" ON public.jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── clients ───────────────────────────────────────────────────────────────────
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.clients;
CREATE POLICY "Service role full access" ON public.clients FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.clients;
CREATE POLICY "Authenticated users" ON public.clients FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── end_customers ─────────────────────────────────────────────────────────────
ALTER TABLE public.end_customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.end_customers;
CREATE POLICY "Service role full access" ON public.end_customers FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.end_customers;
CREATE POLICY "Authenticated users" ON public.end_customers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── staff ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.staff;
CREATE POLICY "Service role full access" ON public.staff FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.staff;
CREATE POLICY "Authenticated users" ON public.staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── machines ──────────────────────────────────────────────────────────────────
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.machines;
CREATE POLICY "Service role full access" ON public.machines FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.machines;
CREATE POLICY "Authenticated users" ON public.machines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── pricing_rules ─────────────────────────────────────────────────────────────
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.pricing_rules;
CREATE POLICY "Service role full access" ON public.pricing_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.pricing_rules;
CREATE POLICY "Authenticated users" ON public.pricing_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── runup_details ─────────────────────────────────────────────────────────────
ALTER TABLE public.runup_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.runup_details;
CREATE POLICY "Service role full access" ON public.runup_details FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.runup_details;
CREATE POLICY "Authenticated users" ON public.runup_details FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── install_details ───────────────────────────────────────────────────────────
ALTER TABLE public.install_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.install_details;
CREATE POLICY "Service role full access" ON public.install_details FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.install_details;
CREATE POLICY "Authenticated users" ON public.install_details FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── delivery_details ──────────────────────────────────────────────────────────
ALTER TABLE public.delivery_details ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.delivery_details;
CREATE POLICY "Service role full access" ON public.delivery_details FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.delivery_details;
CREATE POLICY "Authenticated users" ON public.delivery_details FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── warehouse_movements ───────────────────────────────────────────────────────
ALTER TABLE public.warehouse_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.warehouse_movements;
CREATE POLICY "Service role full access" ON public.warehouse_movements FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.warehouse_movements;
CREATE POLICY "Authenticated users" ON public.warehouse_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── inventory ─────────────────────────────────────────────────────────────────
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.inventory;
CREATE POLICY "Service role full access" ON public.inventory FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.inventory;
CREATE POLICY "Authenticated users" ON public.inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── toner_orders ──────────────────────────────────────────────────────────────
ALTER TABLE public.toner_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.toner_orders;
CREATE POLICY "Service role full access" ON public.toner_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.toner_orders;
CREATE POLICY "Authenticated users" ON public.toner_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── billing_cycles ────────────────────────────────────────────────────────────
ALTER TABLE public.billing_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.billing_cycles;
CREATE POLICY "Service role full access" ON public.billing_cycles FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.billing_cycles;
CREATE POLICY "Authenticated users" ON public.billing_cycles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── billing_line_items ────────────────────────────────────────────────────────
ALTER TABLE public.billing_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.billing_line_items;
CREATE POLICY "Service role full access" ON public.billing_line_items FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.billing_line_items;
CREATE POLICY "Authenticated users" ON public.billing_line_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── storage_weekly ────────────────────────────────────────────────────────────
ALTER TABLE public.storage_weekly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.storage_weekly;
CREATE POLICY "Service role full access" ON public.storage_weekly FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.storage_weekly;
CREATE POLICY "Authenticated users" ON public.storage_weekly FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── email_log ─────────────────────────────────────────────────────────────────
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.email_log;
CREATE POLICY "Service role full access" ON public.email_log FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.email_log;
CREATE POLICY "Authenticated users" ON public.email_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── notifications ─────────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.notifications;
CREATE POLICY "Service role full access" ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.notifications;
CREATE POLICY "Authenticated users" ON public.notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── oauth_tokens ──────────────────────────────────────────────────────────────
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON public.oauth_tokens;
CREATE POLICY "Service role full access" ON public.oauth_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users" ON public.oauth_tokens;
CREATE POLICY "Authenticated users" ON public.oauth_tokens FOR ALL TO authenticated USING (true) WITH CHECK (true);

END $$;
