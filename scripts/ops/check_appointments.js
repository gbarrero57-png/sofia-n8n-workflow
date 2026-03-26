// check_appointments.js — Query recent appointments from Supabase
const https = require('https');

const SUPABASE_HOST = 'inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const DEMO_ID = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: SUPABASE_HOST,
      path,
      method: 'GET',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json'
      }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject); req.end();
  });
}

async function run() {
  console.log('=== Recent appointments (last 10, all clinics) ===');
  const r1 = await apiGet('/rest/v1/appointments?select=*&order=created_at.desc&limit=10');
  console.log('Status:', r1.status);
  const rows = JSON.parse(r1.body);
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No appointments found or error:', r1.body);
  } else {
    rows.forEach(a => {
      console.log(`\n  id:         ${a.id}`);
      console.log(`  clinic_id:  ${a.clinic_id}`);
      console.log(`  start_time: ${a.start_time}  (UTC)`);
      // Lima = UTC-5
      const lima = new Date(new Date(a.start_time).getTime() - 5 * 3600000);
      console.log(`  start_lima: ${lima.toISOString().replace('T', ' ').slice(0, 16)} (Lima)`);
      console.log(`  status:     ${a.status}`);
      console.log(`  patient:    ${a.patient_name || a.contact_phone || '(no name)'}`);
      console.log(`  source:     ${a.source || '(no source)'}`);
      console.log(`  created_at: ${a.created_at}`);
    });
  }

  console.log('\n=== Demo clinic specifically (Sofia Demo) ===');
  const r2 = await apiGet('/rest/v1/appointments?select=*&clinic_id=eq.' + DEMO_ID + '&order=start_time.desc&limit=5');
  const demo = JSON.parse(r2.body);
  if (!Array.isArray(demo) || demo.length === 0) {
    console.log('No appointments for Demo clinic:', r2.body);
  } else {
    demo.forEach(a => {
      const lima = new Date(new Date(a.start_time).getTime() - 5 * 3600000);
      console.log(`  ${lima.toISOString().slice(0,16)} Lima | status=${a.status} | ${a.patient_name || a.contact_phone}`);
    });
  }

  console.log('\n=== All appointments for Monday March 23 (UTC range) ===');
  // Lima 00:00 = UTC 05:00 on same day; Lima 23:59 = UTC 04:59 next day
  const r3 = await apiGet('/rest/v1/appointments?select=*&start_time=gte.2026-03-23T05:00:00&start_time=lt.2026-03-24T05:00:00&order=start_time.asc');
  const monday = JSON.parse(r3.body);
  if (!Array.isArray(monday) || monday.length === 0) {
    console.log('No appointments for Monday March 23 (Lima)');
  } else {
    monday.forEach(a => {
      const lima = new Date(new Date(a.start_time).getTime() - 5 * 3600000);
      console.log(`  ${lima.toISOString().slice(0,16)} Lima | clinic=${a.clinic_id} | status=${a.status} | ${a.patient_name || a.contact_phone}`);
    });
  }
}

run().catch(console.error);
