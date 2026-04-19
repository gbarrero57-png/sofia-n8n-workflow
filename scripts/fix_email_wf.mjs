import { readFileSync, writeFileSync } from 'fs';

const NEW_TOKEN = process.env.AIRTABLE_PAT;
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE = 'https://workflows.n8n.redsolucionesti.com';

const wf = JSON.parse(readFileSync('C:/Users/Barbara/Documents/n8n_workflow_claudio/saas/email_wf_fix.json', 'utf8'));

// 1. Fix Parsear Email — clean regex
const parsearEmail = wf.nodes.find(n => n.name === 'Parsear Email');
parsearEmail.parameters.jsCode = [
  "var openaiItems = $input.all();",
  "var leadItems   = $(\"Preparar Prompt\").all();",
  "var results     = [];",
  "for (var i = 0; i < openaiItems.length; i++) {",
  "  var lead = leadItems[i] ? leadItems[i].json : {};",
  "  if (lead._skip) continue;",
  "  if (!lead.email) continue;",
  "  var raw  = openaiItems[i].json;",
  "  var text = (raw.choices && raw.choices[0] && raw.choices[0].message)",
  "    ? raw.choices[0].message.content",
  "    : JSON.stringify(raw);",
  "  var parsed = {};",
  "  try {",
  "    var clean = text.replace(/```json\\n?/g,'').replace(/```/g,'').trim();",
  "    parsed = JSON.parse(clean);",
  "  } catch(e) {",
  "    parsed = { asunto: 'SofIA para ' + (lead.nombre||''), hook: text.slice(0,300) };",
  "  }",
  "  results.push({ json: {",
  "    record_id:    lead.record_id,",
  "    nombre:       lead.nombre,",
  "    email_real:   lead.email,",
  "    fuente:       lead.fuente || 'google_maps',",
  "    citas_semana: lead.citas_semana || '',",
  "    email_asunto: parsed.asunto || ('SofIA para ' + (lead.nombre||'')),",
  "    hook:         parsed.hook || parsed.cuerpo || '',",
  "    fecha_hoy:    lead.fecha_hoy",
  "  }});",
  "}",
  "return results;"
].join('\n');

// 2. Fix Airtable token in Get Leads Email
const getLeads = wf.nodes.find(n => n.name === 'Get Leads Email');
if (getLeads?.parameters?.headerParameters?.parameters) {
  getLeads.parameters.headerParameters.parameters.forEach(p => {
    if (p.name === 'Authorization') p.value = 'Bearer ' + NEW_TOKEN;
  });
}

// 3. Fix token in any other HTTP Request nodes hitting Airtable
wf.nodes.forEach(n => {
  if (n.parameters?.headerParameters?.parameters) {
    n.parameters.headerParameters.parameters.forEach(p => {
      if (p.name === 'Authorization' && p.value && p.value.includes('pat5sJm0')) {
        p.value = 'Bearer ' + NEW_TOKEN;
      }
    });
  }
  // Also check bodyParameters for patch_url nodes
  if (n.parameters?.url && String(n.parameters.url).includes('airtable.com')) {
    if (n.parameters?.headerParameters?.parameters) {
      n.parameters.headerParameters.parameters.forEach(p => {
        if (p.name === 'Authorization') p.value = 'Bearer ' + NEW_TOKEN;
      });
    }
  }
});

// PUT to n8n
const r = await fetch(`${BASE}/api/v1/workflows/8mglaD5SCaFB2XWZ`, {
  method: 'PUT',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
});
const j = await r.json();
if (!r.ok) { console.error('Error:', JSON.stringify(j).slice(0,300)); process.exit(1); }
console.log('✅ Email workflow fixed:', j.id);
