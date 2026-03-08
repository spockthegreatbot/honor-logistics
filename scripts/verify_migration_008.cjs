const SUPABASE_URL = 'https://ablgxcbebsdsdocmffyk.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibGd4Y2JlYnNkc2RvY21mZnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjc2MjEwMywiZXhwIjoyMDg4MzM4MTAzfQ.zQ77U5Fe_-wo0-RWNdQLEhScUsX_FdSGIN_B5ZdqZYY';

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Accept': 'application/json',
    },
  });
  return res.json();
}

const clientNames = {
  'e539b28f-7ebc-4fa8-981e-a558c6ec88c0': 'AXUS',
  '8edf2fb9-1171-42f8-8b43-ff3aa403dc94': 'Fuji Solutions',
  '98646999-87ac-4a05-9c0b-6411727c9c43': 'Evolved Digital',
};

async function main() {
  const ids = Object.keys(clientNames).join(',');
  const cycles = await rest(
    `/rest/v1/billing_cycles?client_id=in.(${ids})&select=client_id,cycle_name,period_start,period_end,subtotal,gst_amount,grand_total,status&order=client_id,period_start`
  );

  if (!Array.isArray(cycles)) {
    console.error('Error:', cycles);
    return;
  }

  console.log('\n=== BILLING CYCLES VERIFICATION ===\n');
  console.log('Client            | Cycle Name               | Period Start | Period End   | Subtotal     | GST         | Grand Total  | Status');
  console.log('------------------|--------------------------|--------------|--------------|--------------|-------------|--------------|--------');

  let zeroCount = 0;
  for (const c of cycles) {
    const clientName = clientNames[c.client_id] || c.client_id;
    const subtotal = parseFloat(c.subtotal || 0).toFixed(2);
    const gst = parseFloat(c.gst_amount || 0).toFixed(2);
    const grand = parseFloat(c.grand_total || 0).toFixed(2);
    if (parseFloat(grand) === 0) zeroCount++;
    console.log(
      `${clientName.padEnd(17)} | ${(c.cycle_name || '').padEnd(24)} | ${c.period_start} | ${c.period_end}   | $${subtotal.padStart(10)} | $${gst.padStart(10)} | $${grand.padStart(10)} | ${c.status}`
    );
  }

  console.log(`\nTotal cycles: ${cycles.length} | Still $0: ${zeroCount}`);
}

main().catch(console.error);
