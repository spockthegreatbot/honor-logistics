CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  trading_name VARCHAR,
  abn VARCHAR,
  billing_email VARCHAR,
  xero_contact_id VARCHAR,
  payment_terms_days INT DEFAULT 30,
  is_primary BOOL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE end_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  name VARCHAR NOT NULL,
  address TEXT,
  contact_name VARCHAR,
  contact_phone VARCHAR,
  contact_email VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  email VARCHAR UNIQUE NOT NULL,
  role VARCHAR CHECK (role IN ('admin','driver','warehouse','manager')) DEFAULT 'warehouse',
  phone VARCHAR,
  is_active BOOL DEFAULT true,
  auth_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make VARCHAR,
  model VARCHAR NOT NULL,
  machine_type VARCHAR CHECK (machine_type IN ('A4_SFP','A4_MFD','A3','FINISHER','FIN_ACCESSORIES','OTHER')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_year VARCHAR(9) NOT NULL,
  job_type VARCHAR CHECK (job_type IN ('runup','install','delivery','collection','storage','toner','inwards','outwards','misc')) NOT NULL,
  machine_type VARCHAR,
  line_item_name VARCHAR NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  unit VARCHAR DEFAULT 'per_job',
  fuel_applicable BOOL DEFAULT false,
  is_active BOOL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number VARCHAR UNIQUE,
  job_type VARCHAR CHECK (job_type IN ('runup','delivery','collection','install','inwards','outwards','toner_ship','storage')) NOT NULL,
  status VARCHAR CHECK (status IN ('new','runup_pending','runup_complete','ready','dispatched','in_transit','complete','invoiced','cancelled')) DEFAULT 'new',
  client_id UUID REFERENCES clients(id),
  end_customer_id UUID REFERENCES end_customers(id),
  scheduled_date DATE,
  completed_at TIMESTAMPTZ,
  machine_id UUID REFERENCES machines(id),
  serial_number VARCHAR,
  po_number VARCHAR,
  email_source_id UUID,
  billing_cycle_id UUID,
  assigned_to UUID REFERENCES staff(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE SEQUENCE job_number_seq START 1;
CREATE OR REPLACE FUNCTION set_job_number() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL THEN
    NEW.job_number := 'HRL-' || to_char(CURRENT_DATE,'YYYY') || '-' || LPAD(nextval('job_number_seq')::TEXT,4,'0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER job_number_trigger BEFORE INSERT ON jobs FOR EACH ROW EXECUTE FUNCTION set_job_number();

CREATE TABLE runup_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  action_type VARCHAR,
  machine_type VARCHAR,
  unit_price DECIMAL(10,2),
  check_power_on BOOL DEFAULT false,
  check_firmware_loaded BOOL DEFAULT false,
  check_customer_config BOOL DEFAULT false,
  check_serial_verified BOOL DEFAULT false,
  check_test_print BOOL DEFAULT false,
  check_signed_off BOOL DEFAULT false,
  papercut_config TEXT,
  fma_notes TEXT,
  signed_off_by UUID REFERENCES staff(id),
  signed_off_at TIMESTAMPTZ,
  photos TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE install_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  install_type VARCHAR,
  fma_required BOOL DEFAULT false,
  papercut_required BOOL DEFAULT false,
  papercut_notes TEXT,
  fma_notes TEXT,
  unit_price DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE delivery_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  subtype VARCHAR CHECK (subtype IN ('delivery','collection','recycling','swap')),
  from_address TEXT,
  to_address TEXT,
  base_price DECIMAL(10,2),
  fuel_surcharge_pct DECIMAL(5,2) DEFAULT 11.00,
  fuel_override BOOL DEFAULT false,
  fuel_override_reason VARCHAR,
  fuel_surcharge_amt DECIMAL(10,2),
  total_price DECIMAL(10,2),
  driver_id UUID REFERENCES staff(id),
  vehicle VARCHAR,
  delivery_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE warehouse_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  movement_type VARCHAR CHECK (movement_type IN ('inwards','outwards')) NOT NULL,
  po_number VARCHAR,
  sender_name VARCHAR,
  receiver_name VARCHAR,
  product_code VARCHAR,
  serial_number VARCHAR,
  quantity INT DEFAULT 1,
  pallet_location VARCHAR,
  condition VARCHAR,
  received_by UUID REFERENCES staff(id),
  movement_date DATE,
  unit_price DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id),
  serial_number VARCHAR,
  product_code VARCHAR,
  description VARCHAR,
  brand VARCHAR,
  location VARCHAR,
  pallet_location VARCHAR,
  uom VARCHAR,
  item_class VARCHAR CHECK (item_class IN ('pallet','machine','accessory','parts')) DEFAULT 'machine',
  quantity INT DEFAULT 1,
  condition VARCHAR CHECK (condition IN ('new','refurb','faulty','for_disposal')) DEFAULT 'new',
  client_id UUID REFERENCES clients(id),
  end_customer_ref VARCHAR,
  inwards_date DATE,
  outwards_date DATE,
  is_active BOOL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE toner_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  courier VARCHAR CHECK (courier IN ('GO_Logistics','TNT','Couriers_Please','StarTrack','Other')),
  tracking_number VARCHAR,
  efex_ni VARCHAR,
  items JSONB,
  weight_kg DECIMAL(8,2),
  dispatch_date DATE,
  est_delivery DATE,
  status VARCHAR CHECK (status IN ('pending','packed','dispatched','delivered')) DEFAULT 'pending',
  total_price DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE billing_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  cycle_name VARCHAR,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  financial_year VARCHAR(9),
  status VARCHAR CHECK (status IN ('open','review','invoiced','paid')) DEFAULT 'open',
  total_runup DECIMAL(10,2) DEFAULT 0,
  total_delivery DECIMAL(10,2) DEFAULT 0,
  total_fuel_surcharge DECIMAL(10,2) DEFAULT 0,
  total_install DECIMAL(10,2) DEFAULT 0,
  total_storage DECIMAL(10,2) DEFAULT 0,
  total_toner DECIMAL(10,2) DEFAULT 0,
  total_inwards_outwards DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(10,2) DEFAULT 0,
  gst_amount DECIMAL(10,2) DEFAULT 0,
  grand_total DECIMAL(10,2) DEFAULT 0,
  xero_invoice_id VARCHAR,
  xero_invoice_number VARCHAR,
  invoice_sent_at TIMESTAMPTZ,
  invoice_paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE storage_weekly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_cycle_id UUID REFERENCES billing_cycles(id),
  week_label VARCHAR,
  storage_type VARCHAR,
  qty INT,
  cost_ex DECIMAL(10,2),
  total_ex DECIMAL(10,2),
  auto_populated BOOL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ms_message_id VARCHAR UNIQUE,
  subject VARCHAR,
  from_email VARCHAR,
  from_name VARCHAR,
  received_at TIMESTAMPTZ,
  body_text TEXT,
  classification JSONB,
  job_id UUID REFERENCES jobs(id),
  processed BOOL DEFAULT false,
  needs_review BOOL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES staff(id),
  job_id UUID REFERENCES jobs(id),
  type VARCHAR,
  message TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
