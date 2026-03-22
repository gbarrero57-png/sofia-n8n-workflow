/**
 * build_leadgen_v7.js
 * Rediseño del workflow de lead gen:
 * - Antes: 3 páginas de UNA query = máx 60 resultados
 * - Ahora: 25 distritos × 2 términos = 50 queries × 20 = ~600-700 leads únicos
 *
 * Nueva arquitectura:
 * Inicio Manual → Generar Distritos → Buscar Clinicas → Extraer y Dedup
 * → Place Details → Parsear Detalles → IF Nombre Valido → IF Website
 *   TRUE → Scrape Website → Extraer Emails → IF Email
 *           TRUE → Airtable Con Email
 *           FALSE → Airtable Web Sin Email
 *   FALSE → Airtable Sin Web
 */

const https = require('https');
const fs = require('fs');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const WF_ID = 'uYIrhVx6RroPejWw';
const BASE = 'workflows.n8n.redsolucionesti.com';
const GOOGLE_KEY = 'AIzaSyBsEMSSh7mPsVFYjCOkhnT3tcqtnpDtI8I';

function apiGet(path) {
  return new Promise((res, rej) => {
    https.get({ hostname: BASE, path, headers: { 'X-N8N-API-KEY': N8N_KEY } }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
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
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    });
    req.on('error', rej); req.write(data); req.end();
  });
}

async function main() {
  console.log('Fetching current workflow...');
  const wf = await apiGet(`/api/v1/workflows/${WF_ID}`);

  // Nodes to KEEP (from Place Details onwards)
  const keepNames = [
    'Inicio Manual', 'Place Details', 'Parsear Detalles', 'IF Nombre Valido',
    'IF Website', 'Scrape Website', 'Extraer Emails', 'IF Email',
    'Airtable Con Email', 'Airtable Web Sin Email', 'Airtable Sin Web'
  ];

  const keptNodes = wf.nodes.filter(n => keepNames.includes(n.name));
  console.log('Kept nodes:', keptNodes.map(n => n.name).join(', '));

  // Update Extraer Emails with improved filter (no runOnceForEachItem issues)
  const extraer = keptNodes.find(n => n.name === 'Extraer Emails');
  extraer.parameters.jsCode = [
    'const scrapeAll = $input.all();',
    'const leadAll = $("IF Website").all();',
    'const bad = ["example.com","sentry","noreply","wixpress","cloudflare",".png",".jpg",".gif",".svg",".woff",".css",".js",".min","webpack","postcss","bootstrap","jquery","schematics"];',
    'const validTLDs = /\\.(pe|com|org|net|edu|io|co|cl|mx|ar|br|us|info|biz|dental)(\\.pe|\\.co|\\.mx)?$/i;',
    'const semverRe = /\\d+\\.\\d+\\.\\d+/;',
    'return scrapeAll.map(function(item, i) {',
    '  const html = JSON.stringify(item.json);',
    '  const emailRe = /[\\w.+\\-]+@[\\w\\-]+\\.[\\w.]+/g;',
    '  const raw = html.match(emailRe) || [];',
    '  const filtered = raw.filter(function(e) {',
    '    if (e.length > 60) return false;',
    '    if (semverRe.test(e)) return false;',
    '    if (!validTLDs.test(e)) return false;',
    '    return !bad.some(function(b) { return e.includes(b); });',
    '  });',
    '  const unique = Array.from(new Set(filtered));',
    '  const prev = leadAll[i] ? leadAll[i].json : {};',
    '  return { json: Object.assign({}, prev, { email: String(unique[0] || ""), emails_found: unique }) };',
    '});'
  ].join('\n');
  delete extraer.parameters.mode;

  // Reposition kept nodes
  const positions = {
    'Inicio Manual':         [0,    400],
    'Place Details':         [900,  400],
    'Parsear Detalles':      [1120, 400],
    'IF Nombre Valido':      [1340, 400],
    'IF Website':            [1560, 400],
    'Scrape Website':        [1780, 260],
    'Extraer Emails':        [2000, 260],
    'IF Email':              [2220, 260],
    'Airtable Con Email':    [2440, 140],
    'Airtable Web Sin Email':[2440, 380],
    'Airtable Sin Web':      [1780, 560],
  };
  keptNodes.forEach(n => { if (positions[n.name]) n.position = positions[n.name]; });

  // NEW NODE 1: Generar Distritos
  // 25 distritos × 2 términos de búsqueda = 50 queries → ~600-700 leads únicos
  const generarDistritos = {
    id: 'gen-distritos', name: 'Generar Distritos',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [220, 400],
    parameters: {
      jsCode: [
        'const distritos = [',
        '  "Miraflores", "San Isidro", "Surco", "San Borja", "La Molina",',
        '  "Jesus Maria", "Lince", "Magdalena del Mar", "Pueblo Libre", "San Miguel",',
        '  "Barranco", "Chorrillos", "La Victoria", "Brena", "Cercado de Lima",',
        '  "Los Olivos", "San Martin de Porres", "Independencia", "Comas",',
        '  "Villa El Salvador", "San Juan de Miraflores", "Ate Vitarte",',
        '  "Santa Anita", "San Juan de Lurigancho", "Callao"',
        '];',
        'const terminos = ["clinica dental", "dentista"];',
        'const queries = [];',
        'for (var i = 0; i < distritos.length; i++) {',
        '  for (var j = 0; j < terminos.length; j++) {',
        '    queries.push({ json: {',
        '      query: terminos[j] + " " + distritos[i] + " Lima",',
        '      distrito: distritos[i],',
        '      termino: terminos[j]',
        '    }});',
        '  }',
        '}',
        'return queries;'
      ].join('\n')
    }
  };

  // NEW NODE 2: Buscar Clinicas (HTTP Request - Text Search)
  const buscarClinicas = {
    id: 'buscar-clinicas', name: 'Buscar Clinicas',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [440, 400],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: 'https://maps.googleapis.com/maps/api/place/textsearch/json',
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'query', value: '={{ $json.query }}' },
          { name: 'key', value: GOOGLE_KEY },
          { name: 'language', value: 'es' },
          { name: 'type', value: 'dentist' }
        ]
      },
      options: {}
    }
  };

  // NEW NODE 3: Extraer y Dedup
  const extraerDedup = {
    id: 'extraer-dedup', name: 'Extraer y Dedup',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [660, 400],
    parameters: {
      jsCode: [
        'var all = $input.all();',
        'var leads = [];',
        'for (var i = 0; i < all.length; i++) {',
        '  var results = all[i].json.results || [];',
        '  for (var j = 0; j < results.length; j++) {',
        '    var r = results[j];',
        '    if (r.place_id) leads.push({',
        '      place_id: r.place_id,',
        '      nombre_raw: r.name || "",',
        '      rating: r.rating || 0,',
        '      total_resenas: r.user_ratings_total || 0',
        '    });',
        '  }',
        '}',
        '// Deduplicar por place_id',
        'var seen = {};',
        'var unique = leads.filter(function(l) {',
        '  if (seen[l.place_id]) return false;',
        '  seen[l.place_id] = true;',
        '  return true;',
        '});',
        'console.log("Total candidatos: " + leads.length + " | Unicos: " + unique.length);',
        'return unique.map(function(l) {',
        '  return { json: {',
        '    place_id: l.place_id,',
        '    nombre: l.nombre_raw,',
        '    rating: l.rating,',
        '    total_resenas: l.total_resenas',
        '  }};',
        '});'
      ].join('\n')
    }
  };

  // Build final node list
  const nodes = [
    keptNodes.find(n => n.name === 'Inicio Manual'),
    generarDistritos,
    buscarClinicas,
    extraerDedup,
    ...keptNodes.filter(n => n.name !== 'Inicio Manual')
  ];

  // Build connections
  const connections = {
    'Inicio Manual':     { main: [[{ node: 'Generar Distritos', type: 'main', index: 0 }]] },
    'Generar Distritos': { main: [[{ node: 'Buscar Clinicas', type: 'main', index: 0 }]] },
    'Buscar Clinicas':   { main: [[{ node: 'Extraer y Dedup', type: 'main', index: 0 }]] },
    'Extraer y Dedup':   { main: [[{ node: 'Place Details', type: 'main', index: 0 }]] },
    'Place Details':     { main: [[{ node: 'Parsear Detalles', type: 'main', index: 0 }]] },
    'Parsear Detalles':  { main: [[{ node: 'IF Nombre Valido', type: 'main', index: 0 }]] },
    'IF Nombre Valido':  { main: [
      [{ node: 'IF Website', type: 'main', index: 0 }],
      []
    ]},
    'IF Website':        { main: [
      [{ node: 'Scrape Website', type: 'main', index: 0 }],
      [{ node: 'Airtable Sin Web', type: 'main', index: 0 }]
    ]},
    'Scrape Website':    { main: [[{ node: 'Extraer Emails', type: 'main', index: 0 }]] },
    'Extraer Emails':    { main: [[{ node: 'IF Email', type: 'main', index: 0 }]] },
    'IF Email':          { main: [
      [{ node: 'Airtable Con Email', type: 'main', index: 0 }],
      [{ node: 'Airtable Web Sin Email', type: 'main', index: 0 }]
    ]}
  };

  const clean = {
    name: wf.name, nodes, connections,
    settings: wf.settings, staticData: wf.staticData
  };

  fs.writeFileSync('saas/leadgen_v7.json', JSON.stringify(clean, null, 2));
  console.log('\nNodes:', nodes.map(n => n.name).join(' → '));
  console.log('Total nodes:', nodes.length);

  console.log('\nUploading to n8n...');
  const result = await apiPut(`/api/v1/workflows/${WF_ID}`, clean);
  if (result.nodes) {
    console.log('SUCCESS -', result.nodes.length, 'nodes deployed');
    console.log('Expected leads per run: 25 districts × 2 terms × 20 results = ~500-700 unique');
  } else {
    console.log('ERROR:', JSON.stringify(result).slice(0, 300));
  }
}

main().catch(console.error);
