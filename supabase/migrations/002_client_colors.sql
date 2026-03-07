-- Add client color coding and billing frequency
ALTER TABLE clients 
  ADD COLUMN IF NOT EXISTS color_code text DEFAULT '#f97316',
  ADD COLUMN IF NOT EXISTS billing_cycle_frequency text DEFAULT 'biweekly',
  ADD COLUMN IF NOT EXISTS is_billing_client boolean DEFAULT true;

UPDATE clients SET color_code='#f97316', billing_cycle_frequency='biweekly', is_billing_client=true WHERE name='EFEX';
UPDATE clients SET color_code='#64748b', is_billing_client=false WHERE name IN ('NAPS','A E Dunne','Disability Trust','Various/Other');

INSERT INTO clients (name, color_code, billing_cycle_frequency, is_billing_client, payment_terms_days, currency)
VALUES 
  ('Fuji Solutions',  '#3b82f6', 'monthly', true, 30, 'AUD'),
  ('Evolved Digital', '#8b5cf6', 'monthly', true, 30, 'AUD'),
  ('Axus',            '#10b981', 'monthly', true, 30, 'AUD')
ON CONFLICT (name) DO NOTHING;
