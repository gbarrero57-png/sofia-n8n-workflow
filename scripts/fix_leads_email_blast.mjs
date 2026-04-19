/**
 * fix_leads_email_blast.mjs
 * Adds a "Build Email HTML" code node so HTML is built safely per-lead.
 */

const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkMDU3OGJmNy1lYWJjLTRkNDItOGI4My0wNjdlMGIzM2I3MGMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzczMjA3MjI4fQ.Wgu55pt4WNoHs9vkxsndOsxi9gOC9JglBcGPMsjEF-Q';
const BASE = 'https://workflows.n8n.redsolucionesti.com';
const WF_ID = 'w5FI4oE01YHY7hE2';

// HTML built with string concat to avoid template literal / heredoc issues
function buildEmailHtml(nombre) {
  const n = nombre || 'amigo';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
    + '<body style="margin:0;padding:0;background:#f4f7fb;font-family:\'Segoe UI\',Arial,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:30px 0;">'
    + '<tr><td align="center">'
    + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">'
    // Header
    + '<tr><td style="background:linear-gradient(135deg,#1a73e8 0%,#0d47a1 100%);padding:32px 40px;text-align:center;">'
    + '<h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">SofIA</h1>'
    + '<p style="color:#bbdefb;margin:6px 0 0;font-size:14px;">Asistente de IA para Clinicas Dentales</p>'
    + '</td></tr>'
    // Body
    + '<tr><td style="padding:40px;">'
    + '<p style="color:#1a1a1a;font-size:17px;margin:0 0 20px;">Hola <strong>' + n + '</strong>,</p>'
    + '<p style="color:#444;font-size:15px;line-height:1.8;margin:0 0 24px;">'
    + 'Mi nombre es <strong>Gabriel Barrero</strong>, CEO de <strong>RedSoluciones TI</strong>. '
    + 'Hace unos dias mostraste interes en <strong>SofIA</strong>, nuestra solucion de inteligencia '
    + 'artificial para clinicas dentales, y queria escribirte personalmente.</p>'
    + '<p style="color:#444;font-size:15px;line-height:1.8;margin:0 0 28px;">'
    + 'Muchos directores de clinica nos dicen lo mismo: el equipo pasa demasiado tiempo respondiendo '
    + 'WhatsApp, confirmando citas y persiguiendo pacientes que no aparecen. '
    + '<strong>Sofia resuelve exactamente eso</strong>, de forma automatica y sin cambiar tu numero actual.</p>'
    // Feature box
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border-radius:10px;margin:0 0 28px;">'
    + '<tr><td style="padding:24px 28px;">'
    + '<p style="margin:0 0 16px;font-weight:700;color:#1a73e8;font-size:15px;">Lo que SofIA hace por tu clinica:</p>'
    + '<p style="margin:0 0 10px;color:#333;font-size:14px;">Atiende WhatsApp <strong>24/7 sin intervencion humana</strong></p>'
    + '<p style="margin:0 0 10px;color:#333;font-size:14px;">Agenda, confirma y reagenda citas <strong>de forma autonoma</strong></p>'
    + '<p style="margin:0 0 10px;color:#333;font-size:14px;">Envia recordatorios 24h antes para <strong>reducir inasistencias</strong></p>'
    + '<p style="margin:0 0 10px;color:#333;font-size:14px;">Se integra a tu WhatsApp actual, <strong>sin cambiar de numero</strong></p>'
    + '<p style="margin:0;color:#333;font-size:14px;">Reportes mensuales con metricas reales de tu clinica</p>'
    + '</td></tr></table>'
    // CTA
    + '<p style="color:#333;font-size:15px;font-weight:600;margin:0 0 16px;">Me gustaria mostrarte como funciona en tu clinica especificamente.</p>'
    + '<p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 24px;">'
    + 'Tengo disponibilidad esta semana para una <strong>demo de 10 minutos</strong> por WhatsApp o videollamada. '
    + 'Sin compromiso, solo para que veas el sistema en accion.</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">'
    + '<tr><td align="center">'
    + '<a href="https://wa.me/51905858566?text=Hola%20Gabriel%2C%20vi%20tu%20mensaje%20sobre%20SofIA%20y%20me%20interesa%20la%20demo%20de%2010%20minutos"'
    + ' style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 36px;border-radius:50px;box-shadow:0 4px 12px rgba(37,211,102,0.3);">'
    + 'Agendar mi demo de 10 minutos'
    + '</a></td></tr></table>'
    + '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 32px;">Presiona el boton y te respondo de inmediato por WhatsApp</p>'
    // Links
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8edf5;">'
    + '<tr><td style="padding-top:24px;">'
    + '<p style="margin:0 0 12px;font-weight:700;color:#333;font-size:14px;">Sobre nosotros:</p>'
    + '<p style="margin:0 0 8px;font-size:13px;color:#555;">Sitio web: <a href="https://redsolucionesti.com" style="color:#1a73e8;text-decoration:none;">redsolucionesti.com</a></p>'
    + '<p style="margin:0;font-size:13px;color:#555;">Demo en vivo de SofIA: <a href="https://wa.me/51977588512" style="color:#1a73e8;text-decoration:none;">+51 977 588 512</a>'
    + ' <span style="color:#aaa;">(escribe "Hola" y SofIA te atiende)</span></p>'
    + '</td></tr></table>'
    + '</td></tr>'
    // Firma CEO
    + '<tr><td style="background:#f8f9fa;padding:24px 40px;border-top:1px solid #e8edf5;">'
    + '<table cellpadding="0" cellspacing="0"><tr>'
    + '<td style="padding-right:16px;vertical-align:middle;">'
    + '<div style="width:48px;height:48px;border-radius:50%;background:#1a73e8;text-align:center;line-height:48px;color:#fff;font-size:20px;font-weight:700;">G</div>'
    + '</td><td style="vertical-align:middle;">'
    + '<p style="margin:0 0 2px;font-size:15px;color:#1a1a1a;font-weight:700;">Gabriel Barrero</p>'
    + '<p style="margin:0 0 2px;font-size:12px;color:#1a73e8;font-weight:600;">CEO &amp; Founder &#8212; RedSoluciones TI</p>'
    + '<p style="margin:0 0 2px;font-size:12px;color:#777;">WhatsApp: <a href="https://wa.me/51905858566" style="color:#1a73e8;text-decoration:none;">+51 905 858 566</a></p>'
    + '<p style="margin:0;font-size:12px;color:#777;">gabriel@redsolucionesti.com</p>'
    + '</td></tr></table>'
    + '</td></tr>'
    + '</table>'
    + '<p style="color:#bbb;font-size:11px;margin:16px 0 0;text-align:center;">Recibiste este mensaje porque completaste un formulario de interes en SofIA.<br>RedSoluciones TI &middot; Lima, Peru</p>'
    + '</td></tr></table>'
    + '</body></html>';
}

// The code node jsCode — uses string concat, no template literals
const jsCode = `
var item = $input.first().json;
var nombre = item.nombre || '';
var primerNombre = nombre.split(' ')[0];

function buildHtml(n) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
  + '<body style="margin:0;padding:0;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;">'
  + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:30px 0;">'
  + '<tr><td align="center">'
  + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">'
  + '<tr><td style="background:linear-gradient(135deg,#1a73e8 0%,#0d47a1 100%);padding:32px 40px;text-align:center;">'
  + '<h1 style="color:#fff;margin:0;font-size:28px;font-weight:700;">SofIA</h1>'
  + '<p style="color:#bbdefb;margin:6px 0 0;font-size:14px;">Asistente de IA para Clinicas Dentales</p>'
  + '</td></tr>'
  + '<tr><td style="padding:40px;">'
  + '<p style="color:#1a1a1a;font-size:17px;margin:0 0 20px;">Hola <strong>' + n + '</strong>,</p>'
  + '<p style="color:#444;font-size:15px;line-height:1.8;margin:0 0 24px;">'
  + 'Mi nombre es <strong>Gabriel Barrero</strong>, CEO de <strong>RedSoluciones TI</strong>. '
  + 'Hace unos dias mostraste interes en <strong>SofIA</strong>, nuestra solucion de IA para clinicas dentales, '
  + 'y queria escribirte personalmente.</p>'
  + '<p style="color:#444;font-size:15px;line-height:1.8;margin:0 0 28px;">'
  + 'Muchos directores de clinica nos dicen lo mismo: el equipo pasa demasiado tiempo respondiendo '
  + 'WhatsApp, confirmando citas y persiguiendo pacientes que no aparecen. '
  + '<strong>SofIA resuelve exactamente eso</strong>, de forma automatica y sin cambiar tu numero actual.</p>'
  + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border-radius:10px;margin:0 0 28px;">'
  + '<tr><td style="padding:24px 28px;">'
  + '<p style="margin:0 0 16px;font-weight:700;color:#1a73e8;font-size:15px;">Lo que SofIA hace por tu clinica:</p>'
  + '<p style="margin:0 0 10px;color:#333;font-size:14px;">Atiende WhatsApp <strong>24/7 sin intervencion humana</strong></p>'
  + '<p style="margin:0 0 10px;color:#333;font-size:14px;">Agenda, confirma y reagenda citas <strong>de forma autonoma</strong></p>'
  + '<p style="margin:0 0 10px;color:#333;font-size:14px;">Envia recordatorios 24h antes para <strong>reducir inasistencias</strong></p>'
  + '<p style="margin:0 0 10px;color:#333;font-size:14px;">Se integra a tu WhatsApp, <strong>sin cambiar de numero</strong></p>'
  + '<p style="margin:0;color:#333;font-size:14px;">Reportes mensuales con metricas reales de tu clinica</p>'
  + '</td></tr></table>'
  + '<p style="color:#333;font-size:15px;font-weight:600;margin:0 0 16px;">Me gustaria mostrarte como funciona en tu clinica.</p>'
  + '<p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 24px;">'
  + 'Tengo disponibilidad esta semana para una <strong>demo de 10 minutos</strong> por WhatsApp. '
  + 'Sin compromiso, solo para que veas el sistema en accion.</p>'
  + '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">'
  + '<tr><td align="center">'
  + '<a href="https://wa.me/51905858566?text=Hola%20Gabriel%2C%20vi%20tu%20mensaje%20sobre%20SofIA%20y%20me%20interesa%20la%20demo%20de%2010%20minutos"'
  + ' style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 36px;border-radius:50px;">'
  + 'Agendar mi demo de 10 minutos'
  + '</a></td></tr></table>'
  + '<p style="color:#888;font-size:13px;text-align:center;margin:0 0 32px;">Presiona el boton y te respondo de inmediato por WhatsApp</p>'
  + '<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8edf5;">'
  + '<tr><td style="padding-top:24px;">'
  + '<p style="margin:0 0 12px;font-weight:700;color:#333;font-size:14px;">Sobre nosotros:</p>'
  + '<p style="margin:0 0 8px;font-size:13px;color:#555;">Sitio web: <a href="https://redsolucionesti.com" style="color:#1a73e8;text-decoration:none;">redsolucionesti.com</a></p>'
  + '<p style="margin:0;font-size:13px;color:#555;">Demo en vivo: <a href="https://wa.me/51977588512" style="color:#1a73e8;text-decoration:none;">+51 977 588 512</a>'
  + ' <span style="color:#aaa;">(escribe Hola y SofIA te atiende)</span></p>'
  + '</td></tr></table>'
  + '</td></tr>'
  + '<tr><td style="background:#f8f9fa;padding:24px 40px;border-top:1px solid #e8edf5;">'
  + '<table cellpadding="0" cellspacing="0"><tr>'
  + '<td style="padding-right:16px;vertical-align:middle;">'
  + '<div style="width:48px;height:48px;border-radius:50%;background:#1a73e8;text-align:center;line-height:48px;color:#fff;font-size:20px;font-weight:700;">G</div>'
  + '</td><td style="vertical-align:middle;">'
  + '<p style="margin:0 0 2px;font-size:15px;color:#1a1a1a;font-weight:700;">Gabriel Barrero</p>'
  + '<p style="margin:0 0 2px;font-size:12px;color:#1a73e8;font-weight:600;">CEO &amp; Founder - RedSoluciones TI</p>'
  + '<p style="margin:0 0 2px;font-size:12px;color:#777;">WhatsApp directo: <a href="https://wa.me/51905858566" style="color:#1a73e8;text-decoration:none;">+51 905 858 566</a></p>'
  + '<p style="margin:0;font-size:12px;color:#777;">gabriel@redsolucionesti.com</p>'
  + '</td></tr></table>'
  + '</td></tr></table>'
  + '<p style="color:#bbb;font-size:11px;margin:16px 0 0;text-align:center;">'
  + 'Recibiste este mensaje porque completaste un formulario de interes en SofIA.<br>RedSoluciones TI - Lima, Peru'
  + '</p></td></tr></table></body></html>';
}

return [{ json: {
  nombre: nombre,
  email: item.email,
  subject: 'Hola ' + primerNombre + ' - una demo de 10 min puede cambiar tu clinica',
  html: buildHtml(primerNombre)
}}];
`;

async function main() {
  const wf = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
    headers: { 'X-N8N-API-KEY': API_KEY }
  }).then(r => r.json());

  // Remove old build node if any
  wf.nodes = wf.nodes.filter(n => n.name !== 'Build Email HTML');

  // Fix email node: use $json.html and $json.subject
  const emailNode = wf.nodes.find(n => n.name === 'Email Lead Antiguo');
  emailNode.position = [550, 300];
  emailNode.parameters.html = '={{ $json.html }}';
  emailNode.parameters.subject = '={{ $json.subject }}';

  // Add build node
  wf.nodes.push({
    id: 'buildhtml',
    name: 'Build Email HTML',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [330, 300],
    parameters: { jsCode }
  });

  // Reposition contar/telegram/deactivate
  const reposMap = {
    'Contar Enviados': [770, 300],
    'Confirmar Telegram': [990, 300],
    'Desactivar Workflow': [1210, 300]
  };
  wf.nodes.forEach(n => { if (reposMap[n.name]) n.position = reposMap[n.name]; });

  // Fix connections
  wf.connections['Leads Antiguos'] = { main: [[{ node: 'Build Email HTML', type: 'main', index: 0 }]] };
  wf.connections['Build Email HTML'] = { main: [[{ node: 'Email Lead Antiguo', type: 'main', index: 0 }]] };
  wf.connections['Email Lead Antiguo'] = { main: [[{ node: 'Contar Enviados', type: 'main', index: 0 }]] };

  const r = await fetch(`${BASE}/api/v1/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings, staticData: null })
  });
  const d = await r.json();
  if (r.ok) {
    console.log('✅ Workflow actualizado correctamente');
    console.log('   Nodos:', d.nodes?.map(n => n.name).join(' → '));
  } else {
    console.error('❌ Error:', JSON.stringify(d).slice(0, 300));
  }
}

main().catch(console.error);
