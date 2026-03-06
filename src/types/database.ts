export type JobType = 'runup' | 'delivery' | 'collection' | 'install' | 'inwards' | 'outwards' | 'toner_ship' | 'storage'
export type JobStatus = 'new' | 'runup_pending' | 'runup_complete' | 'ready' | 'dispatched' | 'in_transit' | 'complete' | 'invoiced' | 'cancelled'
export type MachineType = 'A4_SFP' | 'A4_MFD' | 'A3' | 'FINISHER' | 'FIN_ACCESSORIES' | 'OTHER'
export type StaffRole = 'admin' | 'driver' | 'warehouse' | 'manager'
export type BillingStatus = 'open' | 'review' | 'invoiced' | 'paid'
export type InventoryCondition = 'new' | 'refurb' | 'faulty' | 'for_disposal'
export type ItemClass = 'pallet' | 'machine' | 'accessory' | 'parts'
export type CourierType = 'GO_Logistics' | 'TNT' | 'Couriers_Please' | 'StarTrack' | 'Other'
export type TonerStatus = 'pending' | 'packed' | 'dispatched' | 'delivered'
export type DeliverySubtype = 'delivery' | 'collection' | 'recycling' | 'swap'
export type MovementType = 'inwards' | 'outwards'
export type PricingJobType = 'runup' | 'install' | 'delivery' | 'collection' | 'storage' | 'toner' | 'inwards' | 'outwards' | 'misc'

export interface Client {
  id: string
  name: string
  trading_name: string | null
  abn: string | null
  billing_email: string | null
  xero_contact_id: string | null
  payment_terms_days: number | null
  is_primary: boolean | null
  created_at: string | null
}

export interface EndCustomer {
  id: string
  client_id: string | null
  name: string
  address: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  notes: string | null
  created_at: string | null
  // Joined
  client?: Client
}

export interface Staff {
  id: string
  name: string
  email: string
  role: StaffRole | null
  phone: string | null
  is_active: boolean | null
  auth_user_id: string | null
  created_at: string | null
}

export interface Machine {
  id: string
  make: string | null
  model: string
  machine_type: MachineType | null
  description: string | null
  created_at: string | null
}

export interface PricingRule {
  id: string
  financial_year: string
  job_type: PricingJobType
  machine_type: string | null
  line_item_name: string
  unit_price: number
  unit: string | null
  fuel_applicable: boolean | null
  is_active: boolean | null
  created_at: string | null
}

export interface Job {
  id: string
  job_number: string | null
  job_type: JobType
  status: JobStatus | null
  client_id: string | null
  end_customer_id: string | null
  scheduled_date: string | null
  completed_at: string | null
  machine_id: string | null
  serial_number: string | null
  po_number: string | null
  email_source_id: string | null
  billing_cycle_id: string | null
  assigned_to: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
  // Joined
  client?: Client
  end_customer?: EndCustomer
  machine?: Machine
  assigned_staff?: Staff
  runup_details?: RunupDetails
  install_details?: InstallDetails
  delivery_details?: DeliveryDetails
  warehouse_movements?: WarehouseMovement[]
  toner_orders?: TonerOrder[]
}

export interface RunupDetails {
  id: string
  job_id: string | null
  action_type: string | null
  machine_type: string | null
  unit_price: number | null
  check_power_on: boolean | null
  check_firmware_loaded: boolean | null
  check_customer_config: boolean | null
  check_serial_verified: boolean | null
  check_test_print: boolean | null
  check_signed_off: boolean | null
  papercut_config: string | null
  fma_notes: string | null
  signed_off_by: string | null
  signed_off_at: string | null
  photos: string[] | null
  created_at: string | null
  // Joined
  signed_off_by_staff?: Staff
}

export interface InstallDetails {
  id: string
  job_id: string | null
  install_type: string | null
  fma_required: boolean | null
  papercut_required: boolean | null
  papercut_notes: string | null
  fma_notes: string | null
  unit_price: number | null
  created_at: string | null
}

export interface DeliveryDetails {
  id: string
  job_id: string | null
  subtype: DeliverySubtype | null
  from_address: string | null
  to_address: string | null
  base_price: number | null
  fuel_surcharge_pct: number | null
  fuel_override: boolean | null
  fuel_override_reason: string | null
  fuel_surcharge_amt: number | null
  total_price: number | null
  driver_id: string | null
  vehicle: string | null
  delivery_notes: string | null
  created_at: string | null
  // Joined
  driver?: Staff
}

export interface WarehouseMovement {
  id: string
  job_id: string | null
  movement_type: MovementType
  po_number: string | null
  sender_name: string | null
  receiver_name: string | null
  product_code: string | null
  serial_number: string | null
  quantity: number | null
  pallet_location: string | null
  condition: string | null
  received_by: string | null
  movement_date: string | null
  unit_price: number | null
  notes: string | null
  created_at: string | null
  // Joined
  received_by_staff?: Staff
}

export interface Inventory {
  id: string
  machine_id: string | null
  serial_number: string | null
  product_code: string | null
  description: string | null
  brand: string | null
  location: string | null
  pallet_location: string | null
  uom: string | null
  item_class: ItemClass | null
  quantity: number | null
  condition: InventoryCondition | null
  client_id: string | null
  end_customer_ref: string | null
  inwards_date: string | null
  outwards_date: string | null
  is_active: boolean | null
  notes: string | null
  created_at: string | null
  // Joined
  machine?: Machine
  client?: Client
}

export interface TonerOrder {
  id: string
  job_id: string | null
  courier: CourierType | null
  tracking_number: string | null
  efex_ni: string | null
  items: Record<string, unknown> | null
  weight_kg: number | null
  dispatch_date: string | null
  est_delivery: string | null
  status: TonerStatus | null
  total_price: number | null
  created_at: string | null
}

export interface BillingCycle {
  id: string
  client_id: string | null
  cycle_name: string | null
  period_start: string
  period_end: string
  financial_year: string | null
  status: BillingStatus | null
  total_runup: number | null
  total_delivery: number | null
  total_fuel_surcharge: number | null
  total_install: number | null
  total_storage: number | null
  total_toner: number | null
  total_inwards_outwards: number | null
  discount_amount: number | null
  subtotal: number | null
  gst_amount: number | null
  grand_total: number | null
  xero_invoice_id: string | null
  xero_invoice_number: string | null
  invoice_sent_at: string | null
  invoice_paid_at: string | null
  created_at: string | null
  // Joined
  client?: Client
  storage_weekly?: StorageWeekly[]
}

export interface StorageWeekly {
  id: string
  billing_cycle_id: string | null
  week_label: string | null
  storage_type: string | null
  qty: number | null
  cost_ex: number | null
  total_ex: number | null
  auto_populated: boolean | null
  notes: string | null
  created_at: string | null
}

export interface EmailLog {
  id: string
  ms_message_id: string | null
  subject: string | null
  from_email: string | null
  from_name: string | null
  received_at: string | null
  body_text: string | null
  classification: Record<string, unknown> | null
  job_id: string | null
  processed: boolean | null
  needs_review: boolean | null
  created_at: string | null
  // Joined
  job?: Job
}

export interface Notification {
  id: string
  staff_id: string | null
  job_id: string | null
  type: string | null
  message: string | null
  read_at: string | null
  created_at: string | null
  // Joined
  staff?: Staff
  job?: Job
}
