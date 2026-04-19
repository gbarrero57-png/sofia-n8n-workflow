/**
 * build_barber_leadgen.mjs
 * Creates a new n8n workflow: "Barber - Leadgen Google Maps"
 * 25 districts × 3 terms = 75 queries → ~800-1000 barbershop leads
 * Saves to Airtable barberia_leads (tblpsK9PoL4bFsAZB)
 */

const API_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE       = 'https://workflows.n8n.redsolucionesti.com';
const GOOGLE_KEY = 'AIzaSyD8mGSMUhdPiGclqIffftWq9aeMQVKQ6Co';
const AT_BASE    = 'app6a4u9dvXMxwOnY';
const AT_TABLE   = 'tblpsK9PoL4bFsAZB'; // barberia_leads
const AT_CRED    = { id: 'YmCX94YiEOb7UtNi', name: 'Airtable Personal Access Token account' };

const nodes = [
  // ── 1. Trigger ─────────────────────────────────────────────────
  {
    id: 'inicio', name: 'Inicio Manual',
    type: 'n8n-nodes-base.manualTrigger', typeVersion: 1,
    position: [0, 400], parameters: {}
  },

  // ── 2. Generar queries ──────────────────────────────────────────
  {
    id: 'gen-distritos', name: 'Generar Distritos',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [220, 400],
    parameters: {
      jsCode: [
        'var distritos = [',
        '  "Miraflores", "San Isidro", "Surco", "San Borja", "La Molina",',
        '  "Jesus Maria", "Lince", "Magdalena del Mar", "Pueblo Libre", "San Miguel",',
        '  "Barranco", "Chorrillos", "La Victoria", "Brena", "Cercado de Lima",',
        '  "Los Olivos", "San Martin de Porres", "Independencia", "Comas",',
        '  "Villa El Salvador", "San Juan de Miraflores", "Ate Vitarte",',
        '  "Santa Anita", "San Juan de Lurigancho", "Callao"',
        '];',
        'var terminos = ["barberia", "barber shop", "peluqueria barber"];',
        'var queries = [];',
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
  },

  // ── 3. Google Maps Text Search ──────────────────────────────────
  {
    id: 'buscar-barber', name: 'Buscar Barberias',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [440, 400],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: 'https://maps.googleapis.com/maps/api/place/textsearch/json',
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'query',    value: '={{ $json.query }}' },
          { name: 'key',      value: GOOGLE_KEY },
          { name: 'language', value: 'es' },
          { name: 'type',     value: 'hair_care' }
        ]
      },
      options: {}
    }
  },

  // ── 4. Dedup ────────────────────────────────────────────────────
  {
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
  },

  // ── 5. Place Details ────────────────────────────────────────────
  {
    id: 'place-details', name: 'Place Details',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [880, 400],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: 'https://maps.googleapis.com/maps/api/place/details/json',
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: 'place_id', value: '={{ $json.place_id }}' },
          { name: 'key',      value: GOOGLE_KEY },
          { name: 'fields',   value: 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,geometry' },
          { name: 'language', value: 'es' }
        ]
      },
      options: {}
    }
  },

  // ── 6. Parsear Detalles ─────────────────────────────────────────
  {
    id: 'parsear-det', name: 'Parsear Detalles',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1100, 400],
    parameters: {
      jsCode: [
        'var items = $input.all();',
        'return items.map(function(item) {',
        '  var r = item.json.result || {};',
        '  var addr = r.formatted_address || "";',
        '  // Extract district from address',
        '  var distritoMatch = addr.match(/,\\s*([^,]+),\\s*Lima/);',
        '  var distrito = distritoMatch ? distritoMatch[1].trim() : "";',
        '  return { json: {',
        '    place_id:      item.json.place_id || "",',
        '    nombre:        r.name || "",',
        '    telefono:      r.formatted_phone_number || "",',
        '    direccion:     addr,',
        '    distrito:      distrito,',
        '    website:       r.website || "",',
        '    rating:        r.rating || 0,',
        '    total_resenas: r.user_ratings_total || 0',
        '  }};',
        '});'
      ].join('\n')
    }
  },

  // ── 7. IF nombre valido ─────────────────────────────────────────
  {
    id: 'if-nombre', name: 'IF Nombre Valido',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [1320, 400],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1', leftValue: '={{ $json.nombre }}',
          rightValue: '', operator: { type: 'string', operation: 'notEmpty' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── 8. IF tiene website ─────────────────────────────────────────
  {
    id: 'if-web', name: 'IF Website',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [1540, 280],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1', leftValue: '={{ $json.website }}',
          rightValue: '', operator: { type: 'string', operation: 'notEmpty' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── 9. Scrape Website ───────────────────────────────────────────
  {
    id: 'scrape-web', name: 'Scrape Website',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
    position: [1760, 160],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: '={{ $json.website }}',
      options: { timeout: 8000 }
    }
  },

  // ── 10. Extraer Emails ──────────────────────────────────────────
  {
    id: 'extraer-emails', name: 'Extraer Emails',
    type: 'n8n-nodes-base.code', typeVersion: 2,
    position: [1980, 160],
    parameters: {
      jsCode: [
        'var scrapeAll = $input.all();',
        'var leadAll   = $("IF Website").all();',
        'var bad = ["example.com","sentry","noreply","wixpress","cloudflare",',
        '  ".png",".jpg",".gif",".svg",".woff",".css",".js",".min",',
        '  "webpack","postcss","bootstrap","jquery","schematics"];',
        'var validTLDs = /\\.(pe|com|org|net|edu|io|co|cl|mx|ar|br|us|info|biz)(\\.pe|\\.co|\\.mx)?$/i;',
        'var semverRe  = /\\d+\\.\\d+\\.\\d+/;',
        'return scrapeAll.map(function(item, i) {',
        '  var html      = JSON.stringify(item.json);',
        '  var emailRe   = /[\\w.+\\-]+@[\\w\\-]+\\.[\\w.]+/g;',
        '  var raw       = html.match(emailRe) || [];',
        '  var filtered  = raw.filter(function(e) {',
        '    if (e.length > 60) return false;',
        '    if (semverRe.test(e)) return false;',
        '    if (!validTLDs.test(e)) return false;',
        '    return !bad.some(function(b) { return e.includes(b); });',
        '  });',
        '  var unique = Array.from(new Set(filtered));',
        '  var prev   = leadAll[i] ? leadAll[i].json : {};',
        '  return { json: Object.assign({}, prev, {',
        '    email: String(unique[0] || ""),',
        '    emails_found: unique',
        '  })};',
        '});'
      ].join('\n')
    }
  },

  // ── 11. IF tiene email ──────────────────────────────────────────
  {
    id: 'if-email', name: 'IF Email',
    type: 'n8n-nodes-base.if', typeVersion: 2,
    position: [2200, 160],
    parameters: {
      conditions: {
        options: { caseSensitive: false, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'c1', leftValue: '={{ $json.email }}',
          rightValue: '', operator: { type: 'string', operation: 'notEmpty' }
        }],
        combinator: 'and'
      }
    }
  },

  // ── 12. Airtable Con Email ──────────────────────────────────────
  {
    id: 'at-con-email', name: 'Airtable Con Email',
    type: 'n8n-nodes-base.airtable', typeVersion: 2.1,
    position: [2420, 60],
    parameters: {
      operation: 'create',
      base: { '__rl': true, value: AT_BASE, mode: 'id' },
      table: { '__rl': true, value: AT_TABLE, mode: 'id' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          nombre:        '={{ $json.nombre }}',
          telefono:      '={{ $json.telefono }}',
          email:         '={{ $json.email }}',
          direccion:     '={{ $json.direccion }}',
          distrito:      '={{ $json.distrito }}',
          rating:        '={{ $json.rating }}',
          total_resenas: '={{ $json.total_resenas }}',
          website:       '={{ $json.website }}',
          place_id:      '={{ $json.place_id }}',
          fuente:        'google_maps',
          status:        'nuevo'
        }
      },
      options: {}
    },
    credentials: { airtableTokenApi: AT_CRED }
  },

  // ── 13. Airtable Web Sin Email ──────────────────────────────────
  {
    id: 'at-web-no-email', name: 'Airtable Web Sin Email',
    type: 'n8n-nodes-base.airtable', typeVersion: 2.1,
    position: [2420, 280],
    parameters: {
      operation: 'create',
      base: { '__rl': true, value: AT_BASE, mode: 'id' },
      table: { '__rl': true, value: AT_TABLE, mode: 'id' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          nombre:        '={{ $json.nombre }}',
          telefono:      '={{ $json.telefono }}',
          email:         '',
          direccion:     '={{ $json.direccion }}',
          distrito:      '={{ $json.distrito }}',
          rating:        '={{ $json.rating }}',
          total_resenas: '={{ $json.total_resenas }}',
          website:       '={{ $json.website }}',
          place_id:      '={{ $json.place_id }}',
          fuente:        'google_maps',
          status:        'sin_email'
        }
      },
      options: {}
    },
    credentials: { airtableTokenApi: AT_CRED }
  },

  // ── 14. Airtable Sin Web ────────────────────────────────────────
  {
    id: 'at-sin-web', name: 'Airtable Sin Web',
    type: 'n8n-nodes-base.airtable', typeVersion: 2.1,
    position: [1760, 400],
    parameters: {
      operation: 'create',
      base: { '__rl': true, value: AT_BASE, mode: 'id' },
      table: { '__rl': true, value: AT_TABLE, mode: 'id' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          nombre:        '={{ $json.nombre }}',
          telefono:      '={{ $json.telefono }}',
          email:         '',
          direccion:     '={{ $json.direccion }}',
          distrito:      '={{ $json.distrito }}',
          rating:        '={{ $json.rating }}',
          total_resenas: '={{ $json.total_resenas }}',
          website:       '',
          place_id:      '={{ $json.place_id }}',
          fuente:        'google_maps',
          status:        'sin_email'
        }
      },
      options: {}
    },
    credentials: { airtableTokenApi: AT_CRED }
  }
];

const connections = {
  'Inicio Manual':    { main: [[{ node: 'Generar Distritos',   type: 'main', index: 0 }]] },
  'Generar Distritos':{ main: [[{ node: 'Buscar Barberias',    type: 'main', index: 0 }]] },
  'Buscar Barberias': { main: [[{ node: 'Extraer y Dedup',     type: 'main', index: 0 }]] },
  'Extraer y Dedup':  { main: [[{ node: 'Place Details',       type: 'main', index: 0 }]] },
  'Place Details':    { main: [[{ node: 'Parsear Detalles',    type: 'main', index: 0 }]] },
  'Parsear Detalles': { main: [[{ node: 'IF Nombre Valido',    type: 'main', index: 0 }]] },
  'IF Nombre Valido': {
    main: [
      [{ node: 'IF Website',           type: 'main', index: 0 }],  // true
      []                                                              // false — skip
    ]
  },
  'IF Website': {
    main: [
      [{ node: 'Scrape Website',        type: 'main', index: 0 }],  // true — tiene web
      [{ node: 'Airtable Sin Web',      type: 'main', index: 0 }]   // false — sin web
    ]
  },
  'Scrape Website':   { main: [[{ node: 'Extraer Emails',      type: 'main', index: 0 }]] },
  'Extraer Emails':   { main: [[{ node: 'IF Email',            type: 'main', index: 0 }]] },
  'IF Email': {
    main: [
      [{ node: 'Airtable Con Email',    type: 'main', index: 0 }],  // true
      [{ node: 'Airtable Web Sin Email',type: 'main', index: 0 }]   // false
    ]
  }
};

const wf = {
  name: 'Barber - Leadgen Google Maps',
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
  staticData: null
};

const r = await fetch(`${BASE}/api/v1/workflows`, {
  method: 'POST',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify(wf)
});
const j = await r.json();
if (!r.ok) { console.error('Error:', JSON.stringify(j).slice(0, 400)); process.exit(1); }
console.log('✅ Barber Leadgen workflow created:', j.id);
console.log('   URL: https://workflows.n8n.redsolucionesti.com/workflow/' + j.id);
