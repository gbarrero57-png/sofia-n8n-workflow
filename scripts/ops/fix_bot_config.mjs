#!/usr/bin/env node
/**
 * fix_bot_config.mjs
 * One-time fix: repairs bot_config JSONB corruption in clinics table.
 * Corrupted form: char-indexed object {"0":"{","1":"\"","2":"b",...}
 * Already executed successfully on 2026-03-26 (fixed 2 clinics).
 * Usage: SUPABASE_SERVICE_KEY=xxx node scripts/ops/fix_bot_config.mjs
 */
import https from 'https';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://inhyrrjidhzrbqecnptn.supabase.co';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;
if (!SERVICE_KEY) { console.error('SUPABASE_SERVICE_KEY required'); process.exit(1); }

function apiReq(method, urlPath, body) {
  const data = body ? JSON.stringify(body) : null;
  return new Promise((res, rej) => {
    const r = https.request({
      hostname: new URL(SUPABASE_URL).hostname, path: urlPath, method,
      headers: {
        apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => res(JSON.parse(d || 'null'))); });
    r.on('error', rej); if (data) r.write(data); r.end();
  });
}

async function main() {
  const clinics = await apiReq('GET', '/rest/v1/clinics?select=id,name,bot_config&limit=20');
  let fixed = 0;
  for (const c of clinics) {
    const bc = c.bot_config;
    if (bc && typeof bc === 'object' && bc['0'] !== undefined) {
      const keys = Object.keys(bc).filter(k => !isNaN(k)).sort((a, b) => +a - +b);
      const str = keys.map(k => bc[k]).join('');
      try {
        const parsed = JSON.parse(str);
        await apiReq('PATCH', '/rest/v1/clinics?id=eq.' + c.id, { bot_config: parsed });
        console.log('Fixed:', c.name);
        fixed++;
      } catch(e) { console.warn('Could not parse for', c.name, e.message); }
    } else {
      console.log('OK (no corruption):', c.name);
    }
  }
  console.log('Done. Fixed', fixed, 'clinic(s).');
}
main().catch(console.error);
