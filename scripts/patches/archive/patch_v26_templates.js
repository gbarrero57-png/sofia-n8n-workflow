// patch_v26_templates.js — Create generic LP3/LP4/LP5 Twilio templates + save SIDs to Supabase
// Templates use ContentVariables for 100% dynamic content
// list-picker items send their 'id' (e.g., pos_1..pos_5) when selected

const https = require('https');
const fs = require('fs');

const TWILIO_ACCOUNT_SID = 'AC4080780a4b4a7d8e7b107a39f01abad3';
const TWILIO_AUTH_TOKEN = '28b9a195bc04dbb6f5045d1971b9bd6a';
const DEMO_CLINIC_ID = 'c6c15fca-d7fc-4d98-83c1-2c5cb5a6bef1';

const sbEnv = fs.readFileSync('c:/Users/Barbara/Documents/n8n_workflow_claudio/saas/.env', 'utf8');
const SUPABASE_KEY = sbEnv.match(/SUPABASE_SERVICE_KEY=(.+)/)[1].trim();

function twilioReq(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const auth = Buffer.from(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN).toString('base64');
    const options = {
      hostname: 'content.twilio.com', port: 443, path: '/v1/Content', method: 'POST',
      headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function sbPatch(clinicId, patch) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(patch);
    const options = {
      hostname: 'inhyrrjidhzrbqecnptn.supabase.co', port: 443,
      path: '/rest/v1/clinics?id=eq.' + clinicId,
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
        'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function sbGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'inhyrrjidhzrbqecnptn.supabase.co', port: 443, path, method: 'GET',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject);
    req.end();
  });
}

const TEMPLATES = [
  {
    key: 'twilio_lp3_sid',
    friendly_name: 'sofia_lp3',
    variables: { '1': 'Elige una opcion:', '2': 'Opcion 1', '3': 'Opcion 2', '4': 'Opcion 3' },
    types: {
      'twilio/list-picker': {
        body: '{{1}}',
        button: 'Ver opciones',
        items: [
          { id: 'pos_1', item: '{{2}}' },
          { id: 'pos_2', item: '{{3}}' },
          { id: 'pos_3', item: '{{4}}' }
        ]
      }
    }
  },
  {
    key: 'twilio_lp4_sid',
    friendly_name: 'sofia_lp4',
    variables: { '1': 'Elige una opcion:', '2': 'Opcion 1', '3': 'Opcion 2', '4': 'Opcion 3', '5': 'Opcion 4' },
    types: {
      'twilio/list-picker': {
        body: '{{1}}',
        button: 'Ver opciones',
        items: [
          { id: 'pos_1', item: '{{2}}' },
          { id: 'pos_2', item: '{{3}}' },
          { id: 'pos_3', item: '{{4}}' },
          { id: 'pos_4', item: '{{5}}' }
        ]
      }
    }
  },
  {
    key: 'twilio_lp5_sid',
    friendly_name: 'sofia_lp5',
    variables: { '1': 'Elige una opcion:', '2': 'Opcion 1', '3': 'Opcion 2', '4': 'Opcion 3', '5': 'Opcion 4', '6': 'Opcion 5' },
    types: {
      'twilio/list-picker': {
        body: '{{1}}',
        button: 'Ver opciones',
        items: [
          { id: 'pos_1', item: '{{2}}' },
          { id: 'pos_2', item: '{{3}}' },
          { id: 'pos_3', item: '{{4}}' },
          { id: 'pos_4', item: '{{5}}' },
          { id: 'pos_5', item: '{{6}}' }
        ]
      }
    }
  }
];

async function main() {
  const sids = {};
  for (const tpl of TEMPLATES) {
    const { key, friendly_name, variables, types } = tpl;
    console.log('Creating', friendly_name, '...');
    const resp = await twilioReq({ friendly_name, language: 'es', variables, types });
    if (resp.sid) {
      sids[key] = resp.sid;
      console.log('  ✅', friendly_name, '=', resp.sid);
    } else {
      console.log('  ❌ Error:', JSON.stringify(resp).substring(0, 300));
      // Check if error is duplicate name
      if (JSON.stringify(resp).includes('already exists') || JSON.stringify(resp).includes('21652')) {
        console.log('  → Template already exists, trying to fetch existing...');
        // Try to list and find it
      }
    }
  }

  if (Object.keys(sids).length === 0) {
    console.log('No SIDs created, aborting Supabase update');
    return;
  }

  // Get current bot_config for SofIA Demo clinic
  const rows = await sbGet('/rest/v1/clinics?select=id,bot_config&id=eq.' + DEMO_CLINIC_ID);
  const clinic = rows[0];
  const bc = clinic.bot_config || {};

  // Merge new SIDs into bot_config
  const updatedBc = Object.assign({}, bc, sids);
  const result = await sbPatch(DEMO_CLINIC_ID, { bot_config: updatedBc });
  if (Array.isArray(result) && result[0]) {
    console.log('\n✅ Supabase bot_config updated with SIDs:', Object.keys(sids).join(', '));
    // Show the new SIDs
    for (const [k, v] of Object.entries(sids)) console.log(' ', k, '=', v);
  } else {
    console.log('\nSupabase response:', JSON.stringify(result).substring(0, 300));
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
