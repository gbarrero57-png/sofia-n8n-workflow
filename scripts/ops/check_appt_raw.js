// check raw start_time value for Sofia Demo appointments
const https = require('https');

const SUPABASE_HOST = 'inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluaHlycmppZGh6cmJxZWNucHRuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTAwNzU3NSwiZXhwIjoyMDg2NTgzNTc1fQ.-YwX0Qf4Gn8MdjFbLxCYuCJV1OzWl2qWWk4hKuU6z7k';
const DEMO_ID = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: SUPABASE_HOST, path, method: 'GET',
      headers: { 'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject); req.end();
  });
}

async function run() {
  // Get total count for demo clinic
  const r1 = await apiGet('/rest/v1/appointments?select=count&clinic_id=eq.' + DEMO_ID);
  console.log('Count query status:', r1.status, r1.body);

  // Get all demo appointments raw
  const r2 = await apiGet('/rest/v1/appointments?select=id,start_time,end_time,status,patient_name,created_at&clinic_id=eq.' + DEMO_ID + '&order=start_time.asc&limit=50');
  console.log('\n=== All Demo appointments (raw start_time) ===');
  const rows = JSON.parse(r2.body);
  if (!Array.isArray(rows)) { console.log('Error:', r2.body); return; }
  console.log('Total:', rows.length);
  rows.forEach(a => {
    console.log(`  ${a.start_time}  status=${a.status}  patient=${a.patient_name}`);
  });
}

run().catch(console.error);
