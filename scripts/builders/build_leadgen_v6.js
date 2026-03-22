const fs = require('fs');
// Always fetch fresh from n8n to avoid stale data
const https = require('https');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WF_ID = 'uYIrhVx6RroPejWw';
const BASE = 'workflows.n8n.redsolucionesti.com';

function apiGet(path) {
  return new Promise((res, rej) => {
    https.get({ hostname: BASE, path, headers: { 'X-N8N-API-KEY': N8N_KEY } }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

function apiPut(path, body) {
  const data = JSON.stringify(body);
  return new Promise((res, rej) => {
    const req = https.request({
      hostname: BASE, path, method: 'PUT',
      headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    });
    req.on('error', rej);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Fetching fresh workflow from n8n...');
  const wf = await apiGet(`/api/v1/workflows/${WF_ID}`);
  console.log('Nodes:', wf.nodes.map(n => n.name).join(' | '));

  // Fix Parsear Detalles: runOnceForAllItems + $input.all() iteration
  // This avoids the input validation bug in runOnceForEachItem mode
  const parsear = wf.nodes.find(n => n.name === 'Parsear Detalles');
  delete parsear.parameters.mode; // default = runOnceForAllItems
  parsear.parameters.jsCode = [
    'const all = $input.all();',
    'return all.map(function(item) {',
    '  const d = item.json.result || {};',
    '  const w = d.website || "";',
    '  const site = w.replace(/\\/+$/, "");',
    '  return { json: {',
    '    place_id: String(d.place_id || ""),',
    '    nombre: String(d.name || ""),',
    '    direccion: String(d.formatted_address || ""),',
    '    telefono: String(d.formatted_phone_number || ""),',
    '    website: String(site),',
    '    rating: Number(d.rating || 0),',
    '    total_resenas: Number(d.user_ratings_total || 0),',
    '    ciudad: "Lima"',
    '  }};',
    '});'
  ].join('\n');

  // Fix Extraer Emails: runOnceForAllItems + index-based pairing with IF Website
  const extraer = wf.nodes.find(n => n.name === 'Extraer Emails');
  delete extraer.parameters.mode; // default = runOnceForAllItems
  extraer.parameters.jsCode = [
    'const scrapeAll = $input.all();',
    'const leadAll = $("IF Website").all();',
    'const bad = ["example.com","sentry","noreply","wixpress","cloudflare",".png",".jpg",".gif",".svg",".woff",".css",".js"];',
    'return scrapeAll.map(function(item, i) {',
    '  const html = JSON.stringify(item.json);',
    '  const emailRe = /[\\w.+\\-]+@[\\w\\-]+\\.[\\w.]+/g;',
    '  const raw = html.match(emailRe) || [];',
    '  const filtered = raw.filter(function(e) { return !bad.some(function(b) { return e.includes(b); }) && e.length < 60; });',
    '  const unique = Array.from(new Set(filtered));',
    '  const prev = leadAll[i] ? leadAll[i].json : {};',
    '  return { json: Object.assign({}, prev, { email: String(unique[0] || ""), emails_found: unique }) };',
    '});'
  ].join('\n');

  // Ensure IF Nombre Valido node exists
  let ifNombre = wf.nodes.find(n => n.name === 'IF Nombre Valido');
  if (!ifNombre) {
    console.log('Adding IF Nombre Valido node...');
    ifNombre = {
      parameters: {
        conditions: {
          options: { caseSensitive: false, leftValue: '', typeValidation: 'loose' },
          conditions: [{
            id: 'cn1',
            leftValue: '={{ $json.nombre }}',
            rightValue: '',
            operator: { type: 'string', operation: 'notEmpty', singleValue: true }
          }],
          combinator: 'and'
        },
        options: {}
      },
      id: 'if-nombre', name: 'IF Nombre Valido',
      type: 'n8n-nodes-base.if', typeVersion: 2,
      position: [2620, 400]
    };
    wf.nodes.push(ifNombre);
  }

  // Fix connections
  wf.connections['Parsear Detalles'] = { main: [[{ node: 'IF Nombre Valido', type: 'main', index: 0 }]] };
  wf.connections['IF Nombre Valido'] = { main: [
    [{ node: 'IF Website', type: 'main', index: 0 }],
    []
  ]};
  wf.connections['IF Website'] = { main: [
    [{ node: 'Scrape Website', type: 'main', index: 0 }],
    [{ node: 'Airtable Sin Web', type: 'main', index: 0 }]
  ]};

  const clean = {
    name: wf.name, nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings, staticData: wf.staticData
  };

  fs.writeFileSync('saas/leadgen_v6.json', JSON.stringify(clean, null, 2));
  console.log('\n=== Parsear code ===');
  console.log(parsear.parameters.jsCode);
  console.log('\n=== Extraer code ===');
  console.log(extraer.parameters.jsCode);

  console.log('\nUploading to n8n...');
  const result = await apiPut(`/api/v1/workflows/${WF_ID}`, clean);
  if (result.nodes) {
    console.log('SUCCESS - nodes:', result.nodes.length);
  } else {
    console.log('ERROR:', JSON.stringify(result).slice(0, 300));
  }
}

main().catch(console.error);
