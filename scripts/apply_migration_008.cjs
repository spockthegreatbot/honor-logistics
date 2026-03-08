const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Direct postgres connection to Supabase
// password is 'postgres' by default for Supabase projects, or we can use the service role
// Actually for Supabase, the DB password needs to be set from the dashboard.
// Let's try with the connection pooler via the REST approach using the pg library.
// Supabase transaction pooler: db.{ref}.supabase.co:5432 — needs DB password.
// Let's try a programmatic approach using supabase-js with raw queries via rpc.

// Instead, apply migration by breaking it into individual UPDATE statements via REST API
const SUPABASE_URL = 'https://ablgxcbebsdsdocmffyk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibGd4Y2JlYnNkc2RvY21mZnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjc2MjEwMywiZXhwIjoyMDg4MzM4MTAzfQ.zQ77U5Fe_-wo0-RWNdQLEhScUsX_FdSGIN_B5ZdqZYY';

const axus_client_id = 'e539b28f-7ebc-4fa8-981e-a558c6ec88c0';
const fuji_client_id = '8edf2fb9-1171-42f8-8b43-ff3aa403dc94';
const evolved_client_id = '98646999-87ac-4a05-9c0b-6411727c9c43';

async function rest(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // 1. Fetch all $0 billing cycles for the 3 clients
  const cycles = await rest('GET',
    `/rest/v1/billing_cycles?client_id=in.(${axus_client_id},${fuji_client_id},${evolved_client_id})&grand_total=eq.0&select=id,client_id,cycle_name,period_start,period_end`
  );
  
  if (!Array.isArray(cycles)) {
    console.error('Failed to fetch cycles:', cycles);
    process.exit(1);
  }
  
  console.log(`Found ${cycles.length} cycles with grand_total = 0`);

  const results = [];

  for (const cycle of cycles) {
    const { id, client_id, cycle_name, period_start, period_end } = cycle;

    // Fetch runup total
    const runupRows = await rest('GET',
      `/rest/v1/runup_details?select=unit_price,jobs!inner(billing_cycle_id)&jobs.billing_cycle_id=eq.${id}`
    );
    // The nested join syntax for PostgREST — let me use a simpler approach

    // Fetch jobs for this cycle
    const jobs = await rest('GET', `/rest/v1/jobs?billing_cycle_id=eq.${id}&select=id,job_type`);
    if (!Array.isArray(jobs) || jobs.length === 0) {
      console.log(`Cycle ${cycle_name} (${period_start} to ${period_end}) has no jobs — skipping`);
      continue;
    }

    const jobIds = jobs.map(j => j.id);
    const jobIdFilter = `(${jobIds.join(',')})`;

    // Runup
    let total_runup = 0;
    const runups = await rest('GET', `/rest/v1/runup_details?job_id=in.${jobIdFilter}&select=unit_price`);
    if (Array.isArray(runups)) total_runup = runups.reduce((s, r) => s + (parseFloat(r.unit_price) || 0), 0);

    // Delivery (delivery + collection job types only)
    let total_delivery = 0, total_fuel_surcharge = 0;
    const delivJobIds = jobs.filter(j => ['delivery','collection'].includes(j.job_type)).map(j => j.id);
    if (delivJobIds.length > 0) {
      const delivs = await rest('GET', `/rest/v1/delivery_details?job_id=in.(${delivJobIds.join(',')})&select=total_price,fuel_surcharge_amt`);
      if (Array.isArray(delivs)) {
        total_delivery = delivs.reduce((s, d) => s + (parseFloat(d.total_price) || 0), 0);
        total_fuel_surcharge = delivs.reduce((s, d) => s + (parseFloat(d.fuel_surcharge_amt) || 0), 0);
      }
    }

    // Install
    let total_install = 0;
    const installs = await rest('GET', `/rest/v1/install_details?job_id=in.${jobIdFilter}&select=unit_price`);
    if (Array.isArray(installs)) total_install = installs.reduce((s, r) => s + (parseFloat(r.unit_price) || 0), 0);

    // Toner
    let total_toner = 0;
    const toners = await rest('GET', `/rest/v1/toner_orders?job_id=in.${jobIdFilter}&select=total_price`);
    if (Array.isArray(toners)) total_toner = toners.reduce((s, r) => s + (parseFloat(r.total_price) || 0), 0);

    // Storage
    let total_storage = 0;
    if (client_id === axus_client_id) {
      total_storage = 1300.00;
    } else {
      const storageRows = await rest('GET', `/rest/v1/storage_weekly?billing_cycle_id=eq.${id}&select=total_ex`);
      if (Array.isArray(storageRows)) total_storage = storageRows.reduce((s, r) => s + (parseFloat(r.total_ex) || 0), 0);
    }

    const subtotal = total_runup + total_delivery + total_install + total_toner + total_storage;
    const gst_amount = Math.round(subtotal * 0.10 * 100) / 100;
    const grand_total = subtotal + gst_amount;

    // Update
    const updateRes = await rest('PATCH',
      `/rest/v1/billing_cycles?id=eq.${id}`,
      {
        total_runup: parseFloat(total_runup.toFixed(2)),
        total_delivery: parseFloat(total_delivery.toFixed(2)),
        total_fuel_surcharge: parseFloat(total_fuel_surcharge.toFixed(2)),
        total_install: parseFloat(total_install.toFixed(2)),
        total_toner: parseFloat(total_toner.toFixed(2)),
        total_storage: parseFloat(total_storage.toFixed(2)),
        total_inwards_outwards: 0,
        subtotal: parseFloat(subtotal.toFixed(2)),
        gst_amount: parseFloat(gst_amount.toFixed(2)),
        grand_total: parseFloat(grand_total.toFixed(2)),
      }
    );

    results.push({
      cycle_name,
      period_start,
      period_end,
      client_id,
      total_runup, total_delivery, total_install, total_toner, total_storage,
      subtotal, gst_amount, grand_total,
    });

    console.log(`✓ ${cycle_name} | runup=$${total_runup.toFixed(2)} del=$${total_delivery.toFixed(2)} inst=$${total_install.toFixed(2)} toner=$${total_toner.toFixed(2)} stor=$${total_storage.toFixed(2)} → grand_total=$${grand_total.toFixed(2)}`);
  }

  console.log('\n=== Migration 008 complete ===');
  console.log(`Updated ${results.length} cycles`);
}

main().catch(e => { console.error(e); process.exit(1); });
