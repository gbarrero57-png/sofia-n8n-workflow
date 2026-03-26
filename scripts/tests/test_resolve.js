const https = require('https');
const KEY = process.env.SUPABASE_SERVICE_KEY;

function resolveClinic(inbox_id, account_id) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ p_inbox_id: inbox_id, p_account_id: account_id });
    const req = https.request({
      hostname: 'inhyrrjidhzrbqecnptn.supabase.co',
      path: '/rest/v1/rpc/resolve_clinic',
      method: 'POST',
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(d);
          const c = Array.isArray(r) ? r[0] : r;
          resolve(c && c.clinic_name ? c.clinic_name + ' [' + c.clinic_id.substring(0,8) + ']' : 'NOT FOUND');
        } catch(e) { resolve('ERROR: ' + e.message); }
      });
    });
    req.on('error', e => resolve('REQ ERROR: ' + e.message));
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== RESOLVE_CLINIC AUDIT ===');
  console.log('Testing all inbox IDs (account_id=2):');
  for (const id of [2,3,5,6,7,8,9,10,11,12]) {
    const result = await resolveClinic(id, 2);
    const status = result === 'NOT FOUND' ? '❌ UNROUTED' : '✅';
    console.log('  inbox_id=' + id + ' → ' + status + ' ' + result);
  }
}

main();
